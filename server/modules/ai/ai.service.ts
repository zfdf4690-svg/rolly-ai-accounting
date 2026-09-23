/**
 * Rolly AI 记账 — AI 能力服务（代码实现，替代妙搭插件机制）
 * 直接调用本地 Python LLM 网关（默认 http://127.0.0.1:8000），
 * 提示词 / jsonStructure / 模型参数由本模块常量定义（原 server/capabilities/*.json 内容）。
 * 链路：前端 → /api/rolly/ai/* → Python 网关 → OpenAI 兼容大模型
 */
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

const PYTHON_LLM_BASE_URL = (
  process.env.PYTHON_LLM_BASE_URL || 'http://127.0.0.1:8000'
).replace(/\/+$/, '');

const MODEL_ID = 'GLM-5.3-Flash-Event';
const MODEL_PARAMS = { maxTokens: 8192, temperature: 0.5 };

// ---------- 提示词配置（原 capability formValue） ----------

/** 文本记账解析 JSON 结构：必填校验 + 追问 + 多轮上下文（账单收集字段规范） */
const TEXT_PARSE_JSON_STRUCTURE = [
  {
    name: 'is_complete',
    paramType: 'Boolean',
    paramDescription: '必填字段（金额+分类+日期）是否齐全',
  },
  {
    name: 'transactions',
    paramType: 'Array',
    paramDescription:
      '必填字段齐全时的交易记录列表，items schema: {amount: Number(消费金额，保留两位小数), category: String(消费分类，可选值：餐饮/交通/购物/娱乐/家居/健康/其他), date: String(日期，格式YYYY-MM-DD), time: String(时间，格式HH:mm), merchant: String(商家/用途，可选), items: Array[{name: String(商品名), amount: Number(金额)}](可选), paymentMethod: String(支付方式，可选), note: String(备注，可选)}；字段不齐全时为空数组',
  },
  {
    name: 'missing_fields',
    paramType: 'Array',
    paramDescription: '缺失的必填字段名数组，如 ["category","date"]；字段齐全时为空数组',
  },
  {
    name: 'followup_question',
    paramType: 'String',
    paramDescription:
      '缺少必填字段时，以记账闺蜜 Rolly 的口吻委婉追问缺失信息的文案（只问缺失项，简短俏皮，不重复已知信息）；字段齐全时为空字符串',
  },
  {
    name: 'extracted',
    paramType: 'Object',
    paramDescription:
      '结合历史上下文后已提取到的全部字段对象，可含 amount/category/date/time/merchant/items/paymentMethod/note 任一子集（即使不完整也要输出），供下一轮继续补齐',
  },
];

const TEXT_PARSE_PROMPT = `你是 Rolly 记账应用的账单解析助手，负责从用户消息中提取消费记录字段。

【当前时间基准（用户本地）】
今天日期：{{input.today_date}}
当前时刻：{{input.current_time}}
用户时区：{{input.timezone}}
相对时间表达（如"昨天/前天/上周X/N月N日/今天"）一律按"今天日期"换算成具体的 YYYY-MM-DD 日期，不得自行猜测。

【账单字段规范】
从用户消息中提取以下字段：
- amount（金额，必填）：消费金额数值，统一保留两位小数，如 15 → 15.00
- category（分类，必填）：从 餐饮、交通、购物、娱乐、家居、健康、其他 七类中选一；根据消费事物推断分类：咖啡/奶茶/外卖/火锅→餐饮，打车/地铁/加油/停车→交通，电影/游戏/演唱会→娱乐，衣服/化妆品/数码→购物，房租/水电/家具→家居，药品/体检→健康；**重要：只有用户消息中没有可判断消费类型的消费事物（例如只发了数字"1"、或只有金额没有任何消费内容线索）时，category 一律视为缺失（严禁为了建卡而默认填"其他"），必须追问分类**
- date（日期，必填）：YYYY-MM-DD 格式；用户未提任何时间语境 → 默认为今天日期；用户提到相对时间 → 按今天日期换算成具体日期
- time（时间，可选）：HH:mm 格式；用户未提 → 默认为当前时刻
- merchant（商家/用途，可选）：消费场所或用途，如"星巴克""房租"
- items（明细，可选）：同一消费含多件商品时拆分，[{name: 商品名, amount: 金额}]；单件消费可不填
- paymentMethod（支付方式，可选）：微信、支付宝、现金、银行卡等
- note（备注，可选）：额外说明，如"请客""AA"

【历史上下文（用户可能正在补充上一轮缺失的信息）】
之前的对话：
{{input.context_history}}

之前已提取的字段（视为已确认信息，直接保留）：
{{input.partial_fields}}

结合历史上下文与本次消息合并提取：历史已提取的字段直接保留；本次消息用于补充缺失字段——若本次消息给出了消费事物（如"咖啡""打车"），必须据此推断出 category 并补齐；只要金额、分类、日期三者能够确定，就必须输出完整 transactions 并 isComplete=true，**不得继续追问**。若本次消息与历史无关（全新的一次记账），忽略历史，仅按本次消息解析。

【建卡规则】
1. 必填字段（金额+分类+日期）三者齐全 → isComplete=true，transactions 输出交易记录（一次消费一条，含多件商品时按明细拆多条），missingFields 为空数组，followupQuestion 为空字符串
2. 缺少任一必填字段，**或用户消息只有金额、没有任何可判断消费内容的线索（如只发"1"）** → isComplete=false，transactions 为空数组，在 missingFields 列出缺失的必填字段名，并用 followupQuestion 以记账闺蜜 Rolly 的口吻委婉追问缺失信息（只问缺失项，简短俏皮，不要重复用户已知的信息）；严禁为了建卡而编造分类或消费内容
3. extracted 字段始终输出"历史+本次"合并后已提取到的全部字段对象（即使不完整），供下一轮继续补齐

【本次用户消息】
{{input.accounting_text}}`;

const ROAST_PROMPT = `你是我的毒舌记账闺蜜Rolly，性格直爽可爱，吐槽犀利但又充满关心，说话自带活泼可爱的语气，经常使用emoji来增加趣味性。

用户刚刚记录了一笔交易：{{input.transaction_content}}

请你根据这笔交易内容生成一段毒舌但暖心的吐槽回复，要求：
1. 字数控制在50-150字之间，简短有力
2. 风格要活泼可爱，使用网络热词和生活化的表达方式
3. 吐槽要精准戳中消费痛点，但最后要带有一点关心或建议
4. 适当使用可爱的emoji，不要使用太多
5. 语气就像闺蜜在耳边吐槽一样自然，不要太官方
6. 可以根据消费类型给出不同风格的吐槽：
   - 如果是餐饮消费：吐槽吃货属性，同时提醒注意饮食健康
   - 如果是购物消费：吐槽剁手行为，同时提醒理性消费
   - 如果是娱乐消费：吐槽会享受生活，同时提醒劳逸结合
   - 如果是交通/住房等必要消费：适当安慰，同时提醒做好规划

注意：不要输出任何多余的内容，直接给出吐槽回复即可。`;

const RECEIPT_JSON_STRUCTURE = [
  {
    paramType: 'String',
    name: 'merchant_name',
    paramDescription: '商家名称，如店铺名、公司名',
  },
  {
    name: 'transaction_date',
    paramDescription: '交易日期，格式统一为YYYY-MM-DD，未识别到则为空字符串',
    paramType: 'String',
  },
  {
    name: 'total_amount',
    paramDescription:
      '总金额，保留两位小数的字符串格式，如"99.90"，未识别到则为空字符串',
    paramType: 'String',
  },
  {
    name: 'items',
    paramDescription:
      '商品条目列表，items schema: {name: string(商品名称), quantity: string(数量), price: string(单价), amount: string(小计)}，无商品则为空数组',
    paramType: 'Array',
  },
  {
    name: 'payment_method',
    paramDescription: '支付方式，如微信支付、支付宝、现金等，未识别到则为空字符串',
    paramType: 'String',
  },
];

const RECEIPT_PROMPT = `你是专业的小票/收据识别专家，请从提供的小票图片中精准提取结构化信息，注意：1. 金额类字段统一保留两位小数并以字符串格式返回；2. 日期统一转换为YYYY-MM-DD格式；3. 未识别到的字段返回空字符串，数组类型返回空数组；4. 商品条目需完整提取名称、数量、单价和小计信息。额外要求：{{input.extract_requirements}}`;

const DAILY_SUMMARY_PROMPT = `你是毒舌Rolly，专门以俏皮毒舌的风格点评用户的每日消费。

请根据以下当天的交易记录生成中文消费总结：
交易记录：{{input.transaction_records}}

总结要求：
1. 风格必须是俏皮毒舌，又不失幽默，像朋友吐槽一样亲切
2. 必须包含以下内容：
   - 当日总支出金额
   - 消费总笔数
   - 针对不同消费分类的犀利点评
   - 贴合消费习惯的实用小建议
3. 整体长度控制在200-300字，语言口语化，避免生硬
4. 可以适当使用网络热词和emoji增加趣味性
5. 毒舌但不伤人，吐槽中带有关心的感觉`;

// ---------- 账单修改（审核机制）----------

/** 修改解析 JSON 结构：定位目标交易 + 提取变更字段 + 确认文案 */
const MODIFY_JSON_STRUCTURE = [
  {
    name: 'found',
    paramType: 'Boolean',
    paramDescription: '是否成功定位到目标交易并理解修改内容',
  },
  {
    name: 'target_index',
    paramType: 'Number',
    paramDescription: '目标交易在 recent_transactions 数组中的下标（从0开始），未定位到则为 -1',
  },
  {
    name: 'changes',
    paramType: 'Object',
    paramDescription:
      '要修改的字段对象，键可为以下任一子集：{amount: Number(新金额), note: String(新备注/名称), category: String(新分类：餐饮/交通/购物/娱乐/家居/健康/其他), date: String(新日期YYYY-MM-DD), time: String(新时间HH:mm), merchant: String(新商家)}；未定位或无修改内容则为空对象',
  },
  {
    name: 'confirm_text',
    paramType: 'String',
    paramDescription:
      '定位成功时输出简短确认文案（如"把咖啡从 ¥1.00 改成 ¥28.00，对吗？"）；定位失败时输出追问文案（如"你说的是哪一笔咖啡呀？最近记了好几笔～"）',
  },
];

const MODIFY_PROMPT = `你是 Rolly 记账应用的账单修改助手。用户想修改一笔已记账的消费，你需要定位目标交易、提取修改内容、生成审核确认文案。

【目标交易（最近记录的消费，JSON 数组）】
{{input.recent_transactions}}

【当前时间基准】
今天日期：{{input.today_date}}
当前时刻：{{input.current_time}}

【用户修改指令】
{{input.modify_text}}

【修改规则】
1. 从 recent_transactions 中定位用户要修改的交易：优先按备注/商家/分类/金额/日期匹配（如"咖啡""打车""昨天的"）
2. 提取用户要修改的字段到 changes 对象，只放用户明确要改的字段：
   - 金额表述：如"金额是28""28才对""不是1是28" → amount: 28
   - 名称表述：如"名字是拿铁""不是咖啡是拿铁" → note: "拿铁"
   - 分类表述：如"是交通" → category: "交通"
   - 日期表述：如"是昨天" → date: 按今天日期换算的 YYYY-MM-DD
   - 时间、商家同理
3. 能唯一确定目标交易且提取到有效变更 → found=true，target_index 填对应下标，changes 输出变更，confirm_text 生成简短确认文案（明确"旧值→新值"，如"把咖啡从 ¥1.00 改成 ¥28.00，对吗？"）
4. 有多个候选目标无法确定（如多笔咖啡）→ found=false，target_index=-1，changes={}，confirm_text 追问用户指认是哪一笔（列出候选简要信息）
5. 无法理解修改内容（如纯闲聊"随便"）→ found=false，target_index=-1，changes={}，confirm_text 请用户说清楚要改什么

【输出要求】
严格按 JSON 结构输出，只输出合法 JSON 对象。`;

function renderPrompt(template: string, input: Record<string, unknown>): string {
  return template.replace(/\{\{input\.(\w+)\}\}/g, (_, key: string) =>
    input[key] === undefined ? '' : String(input[key]),
  );
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * 解析客户端传来的本地时间（浏览器实时时间，最准），生成提示词注入用的
 * 今天日期 / 当前时刻 / 时区。未传时用服务器本地时间兜底。
 */
function resolveLocalTime(clientTime?: string, clientTimezone?: string) {
  let todayStr: string;
  let nowTime: string;
  if (clientTime && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(clientTime)) {
    // 带本地偏移的 ISO 字符串，前半部分即用户本地日期/时刻
    todayStr = clientTime.slice(0, 10);
    nowTime = clientTime.slice(11, 16);
  } else {
    const now = new Date();
    todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    nowTime = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  }
  return {
    todayStr,
    nowTime,
    timezone: clientTimezone && clientTimezone !== 'local' ? clientTimezone : '本地时区',
  };
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  /** 非流式：调用 Python 网关并返回结构化 data */
  private async callPython<T>(endpoint: string, body: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${PYTHON_LLM_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      this.logger.error(`无法连接 Python LLM 服务（${PYTHON_LLM_BASE_URL}）: ${String(e)}`);
      throw new ServiceUnavailableException(
        `无法连接 Python LLM 服务（${PYTHON_LLM_BASE_URL}），请先启动 python-llm/server.py`,
      );
    }
    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      throw new ServiceUnavailableException(
        `Python LLM 服务返回非 JSON（${res.status}）：${text.slice(0, 200)}`,
      );
    }
    if (!res.ok || json.error) {
      throw new ServiceUnavailableException(
        `Python LLM 服务错误（${res.status}）：${json.error || text.slice(0, 200)}`,
      );
    }
    return json.data as T;
  }

  /** 文本记账解析：自然语言 → 结构化交易列表（含必填校验/追问/多轮上下文） */
  async parseAccounting(
    text: string,
    opts: {
      clientTime?: string;
      clientTimezone?: string;
      contextHistory?: string;
      partialFields?: Record<string, unknown>;
    } = {},
  ): Promise<{
    isComplete: boolean;
    transactions: any[];
    missingFields: string[];
    followupQuestion: string;
    extracted: Record<string, unknown>;
  }> {
    const { todayStr, nowTime, timezone } = resolveLocalTime(
      opts.clientTime,
      opts.clientTimezone,
    );
    const partialStr =
      opts.partialFields && Object.keys(opts.partialFields).length
        ? JSON.stringify(opts.partialFields, null, 2)
        : '（无）';
    const history = opts.contextHistory?.trim() || '（无）';

    const data = await this.callPython<any>('/llm/text-to-json', {
      prompt: renderPrompt(TEXT_PARSE_PROMPT, {
        today_date: todayStr,
        current_time: nowTime,
        timezone,
        context_history: history,
        partial_fields: partialStr,
        accounting_text: text,
      }),
      jsonStructure: TEXT_PARSE_JSON_STRUCTURE,
      modelID: MODEL_ID,
      // 结构解析类任务用低温保证"建卡/追问"判定稳定；吐槽/总结仍用默认温度
      modelParams: { ...MODEL_PARAMS, temperature: 0.2 },
    });
    const d = data ?? {};
    return {
      isComplete: Boolean(d.is_complete ?? d.isComplete),
      transactions: Array.isArray(d.transactions) ? d.transactions : [],
      missingFields: Array.isArray(d.missing_fields ?? d.missingFields)
        ? (d.missing_fields ?? d.missingFields)
        : [],
      followupQuestion: String(d.followup_question ?? d.followupQuestion ?? ''),
      extracted:
        d.extracted && typeof d.extracted === 'object' ? d.extracted : {},
    };
  }

  /** 小票识别：图片(dataURL/URL) → 结构化小票信息 */
  async ocrReceipt(image: string, extractRequirements = ''): Promise<any> {
    const data = await this.callPython<any>('/llm/image-to-json', {
      prompt: renderPrompt(RECEIPT_PROMPT, { extract_requirements: extractRequirements }),
      jsonStructure: RECEIPT_JSON_STRUCTURE,
      images: [image],
      modelID: MODEL_ID,
      modelParams: MODEL_PARAMS,
    });
    return data ?? {};
  }

  /** 账单修改解析：修改指令 + 最近交易 → 目标定位 + 变更提取 + 确认文案 */
  async parseModify(
    modifyText: string,
    recentTransactions: any[],
    opts: { clientTime?: string; clientTimezone?: string } = {},
  ): Promise<{
    found: boolean;
    targetIndex: number;
    changes: Record<string, unknown>;
    confirmText: string;
  }> {
    const { todayStr, nowTime, timezone } = resolveLocalTime(
      opts.clientTime,
      opts.clientTimezone,
    );
    const recentStr = recentTransactions.length
      ? JSON.stringify(
          recentTransactions.map((t, i) => ({
            index: i,
            note: t.note || '',
            category: t.category || '',
            amount: Number(t.amount) || 0,
            date: t.date || '',
            time: t.time || '',
            merchant: t.merchant || '',
          })),
          null,
          2,
        )
      : '（无）';

    const data = await this.callPython<any>('/llm/text-to-json', {
      prompt: renderPrompt(MODIFY_PROMPT, {
        recent_transactions: recentStr,
        today_date: todayStr,
        current_time: nowTime,
        timezone,
        modify_text: modifyText,
      }),
      jsonStructure: MODIFY_JSON_STRUCTURE,
      modelID: MODEL_ID,
      modelParams: { ...MODEL_PARAMS, temperature: 0.2 },
    });
    const d = data ?? {};
    return {
      found: Boolean(d.found ?? d.is_found),
      targetIndex:
        typeof d.target_index === 'number' ? d.target_index : -1,
      changes:
        d.changes && typeof d.changes === 'object' ? d.changes : {},
      confirmText: String(d.confirm_text ?? d.confirmText ?? ''),
    };
  }

  /** 流式：按片段产出吐槽 / 总结文本 */
  private async *streamChat(prompt: string): AsyncGenerator<string> {
    let res: Response;
    try {
      res = await fetch(`${PYTHON_LLM_BASE_URL}/llm/generate/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, modelID: MODEL_ID, modelParams: MODEL_PARAMS }),
      });
    } catch (e) {
      this.logger.error(`无法连接 Python LLM 服务（${PYTHON_LLM_BASE_URL}）: ${String(e)}`);
      throw new ServiceUnavailableException('Python LLM 服务未启动，AI 回复不可用');
    }
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => '');
      throw new ServiceUnavailableException(`Python LLM 服务错误（${res.status}）：${detail.slice(0, 200)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sepIdx: number;
      while ((sepIdx = buffer.indexOf('\n\n')) >= 0) {
        const event = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);
        for (const line of event.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const obj = JSON.parse(payload);
            if (typeof obj.content === 'string' && obj.content) {
              yield obj.content;
            }
          } catch {
            // 忽略无法解析的 SSE 片段
          }
        }
      }
    }
  }

  /** 记账吐槽（流式） */
  streamRoast(transactionContent: string): AsyncGenerator<string> {
    return this.streamChat(renderPrompt(ROAST_PROMPT, { transaction_content: transactionContent }));
  }

  /** 每日消费总结（流式） */
  streamDailySummary(transactionRecords: string): AsyncGenerator<string> {
    return this.streamChat(
      renderPrompt(DAILY_SUMMARY_PROMPT, { transaction_records: transactionRecords }),
    );
  }
}
