import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  TransactionDTO, ChatMessageDTO,
  ListTransactionsResponse,
  CreateTransactionsResponse,
  ListMessagesResponse,
  CreateMessagesResponse,
  GetSummaryResponse, SaveSummaryResponse,
  ImportAllRequest, ImportAllResponse,
} from '@shared/api.interface';

export async function listTransactions(): Promise<TransactionDTO[]> {
  const res = await axiosForBackend.get<ListTransactionsResponse>(
    '/api/rolly/transactions'
  );
  return res.data.items;
}

export async function createTransactions(
  transactions: TransactionDTO[]
): Promise<number> {
  const res = await axiosForBackend.post<CreateTransactionsResponse>(
    '/api/rolly/transactions',
    { transactions }
  );
  return res.data.createdCount;
}

export async function deleteTransaction(id: string): Promise<void> {
  await axiosForBackend.delete(`/api/rolly/transactions/${id}`);
}

export async function listMessages(): Promise<ChatMessageDTO[]> {
  const res = await axiosForBackend.get<ListMessagesResponse>(
    '/api/rolly/messages'
  );
  return res.data.items;
}

export async function createMessages(
  messages: ChatMessageDTO[]
): Promise<number> {
  const res = await axiosForBackend.post<CreateMessagesResponse>(
    '/api/rolly/messages',
    { messages }
  );
  return res.data.createdCount;
}

export async function updateMessage(
  id: string,
  content: string
): Promise<void> {
  await axiosForBackend.patch(`/api/rolly/messages/${id}`, {
    content,
  });
}

export async function getSummary(
  date: string
): Promise<GetSummaryResponse> {
  const res = await axiosForBackend.get<GetSummaryResponse>(
    `/api/rolly/summaries?date=${date}`
  );
  return res.data;
}

export async function saveSummary(
  date: string,
  summary: string
): Promise<void> {
  await axiosForBackend.put<SaveSummaryResponse>(
    '/api/rolly/summaries',
    { date, summary }
  );
}

export async function importAll(
  data: ImportAllRequest
): Promise<ImportAllResponse> {
  const res = await axiosForBackend.post<ImportAllResponse>(
    '/api/rolly/import',
    data
  );
  return res.data;
}

// ================= AI 能力（替代妙搭插件 capabilityClient 调用） =================

export interface ParsedTransaction {
  amount: number;
  category: string;
  remark?: string;
  /** 账单收集字段（AI 提取） */
  date?: string; // YYYY-MM-DD（必填，未提时间时默认今天）
  time?: string; // HH:mm
  merchant?: string;
  items?: { name: string; amount: number }[];
  paymentMethod?: string;
  note?: string;
}

export interface ParseTextResult {
  isComplete: boolean;
  transactions: ParsedTransaction[];
  missingFields: string[];
  followupQuestion: string;
  extracted: Record<string, unknown>;
}

/** 生成带本地时区偏移的 ISO 字符串（浏览器实时时间，作为 AI 时间基准） */
function toLocalIso(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/**
 * 文本记账解析：自然语言 → 结构化交易列表 + 必填校验/追问
 * @param opts.contextHistory 多轮追问时的历史对话文本
 * @param opts.partialFields 多轮追问时已提取的部分字段
 */
export async function parseText(
  accountingText: string,
  opts?: {
    contextHistory?: string;
    partialFields?: Record<string, unknown>;
  }
): Promise<ParseTextResult> {
  const now = new Date();
  const body: Record<string, unknown> = {
    accounting_text: accountingText,
    client_time: toLocalIso(now),
    client_timezone:
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'local',
  };
  if (opts?.contextHistory) body.context_history = opts.contextHistory;
  if (opts?.partialFields && Object.keys(opts.partialFields).length) {
    body.partial_fields = opts.partialFields;
  }
  const res = await axiosForBackend.post<ParseTextResult>(
    '/api/rolly/ai/text-to-json',
    body
  );
  return res.data;
}

/** 小票图片识别：dataURL/URL → 结构化小票信息 */
export async function ocrReceipt(
  image: string,
  extractRequirements?: string
): Promise<any> {
  const res = await axiosForBackend.post<any>(
    '/api/rolly/ai/image-to-json',
    { image, extract_requirements: extractRequirements }
  );
  return res.data;
}

// ================= 账单修改（审核机制） =================

export interface ModifyResult {
  found: boolean;
  targetIndex: number;
  changes: Record<string, unknown>;
  confirmText: string;
}

/** 账单修改解析：修改指令 + 最近交易 → 目标定位 + 变更提取 + 审核确认文案 */
export async function parseModify(
  modifyText: string,
  recentTransactions: Array<Record<string, unknown>>,
  opts?: { clientTime?: string; clientTimezone?: string }
): Promise<ModifyResult> {
  const now = new Date();
  const body: Record<string, unknown> = {
    modify_text: modifyText,
    recent_transactions: recentTransactions,
    client_time: opts?.clientTime ?? toLocalIso(now),
    client_timezone:
      (opts?.clientTimezone ??
        Intl.DateTimeFormat().resolvedOptions().timeZone) ||
      'local',
  };
  const res = await axiosForBackend.post<ModifyResult>(
    '/api/rolly/ai/modify-to-json',
    body
  );
  return res.data;
}

/** 更新交易字段（AI 修改审核确认后调用） */
export async function updateTransaction(
  id: string,
  patch: Record<string, unknown>
): Promise<{ success: boolean }> {
  const res = await axiosForBackend.patch<{ success: boolean }>(
    `/api/rolly/transactions/${id}`,
    patch
  );
  return res.data;
}

/**
 * 流式读取后端 SSE（事件 data 为 JSON 字符串 {"content":"..."}），
 * 逐片段回调 onChunk，返回完整文本。
 */
async function streamSse(
  url: string,
  body: Record<string, string>,
  onChunk: (piece: string) => void
): Promise<string> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok || !resp.body) {
    throw new Error(`AI 流式请求失败：${resp.status}`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
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
            full += obj.content;
            onChunk(obj.content);
          }
        } catch {
          // 忽略无法解析的 SSE 片段
        }
      }
    }
  }
  return full;
}

/** 记账吐槽（流式） */
export function streamRoast(
  transactionContent: string,
  onChunk: (piece: string) => void
): Promise<string> {
  return streamSse(
    '/api/rolly/ai/generate-stream',
    { transaction_content: transactionContent },
    onChunk
  );
}

/** 每日消费总结（流式） */
export function streamDailySummary(
  transactionRecords: string,
  onChunk: (piece: string) => void
): Promise<string> {
  return streamSse(
    '/api/rolly/ai/daily-summary-stream',
    { transaction_records: transactionRecords },
    onChunk
  );
}