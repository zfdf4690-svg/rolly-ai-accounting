// ---- plugin:accounting_roast_generate_1 ----
// ============================================================
// 插件 accounting_roast_generate_1 (记账吐槽生成) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface AccountingRoastGenerateOneInput {
  /** 用户的交易内容，如消费金额、消费类型、消费场景等 */
  transaction_content: string;
}

/**
 * capabilityClient.load('accounting_roast_generate_1').callStream<AccountingRoastGenerateOneOutput>('textGenerate', input)
 * 每个 chunk 就是下面这个扁平对象，字段名与 AccountingRoastGenerateOneOutput 一致，外面没有 data / choices / message 包装：
 *   {"content":"示例文本","response":"示例文本"}
 * 返回值可能是 AsyncIterable<chunk>，也可能是 { output: AsyncIterable<chunk> }，取流前先归一化。
 * 逐段累加：
 *   for await (const chunk of stream) { result += chunk.content ?? ''; }
 */
export interface AccountingRoastGenerateOneOutput {
  /** [object Object] */
  content: string;
  /** [object Object] */
  response?: string;
}
// ---- end:accounting_roast_generate_1 ----

// ---- plugin:receipt_image_ocr_extract_1 ----
// ============================================================
// 插件 receipt_image_ocr_extract_1 (小票图片识别) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface ReceiptImageOcrExtractOneInput {
  /** 待识别的小票/收据图片 */
  receipt_image: string[];
  /** 额外的提取要求（可选） */
  extract_requirements?: string;
}

/**
 * capabilityClient.load('receipt_image_ocr_extract_1').call<ReceiptImageOcrExtractOneOutput>('imageToJson', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { merchant_name, transaction_date, total_amount, ... } = result;
 * 返回值形如：
 *   {"merchant_name":"示例文本","transaction_date":"示例文本","total_amount":"示例文本","items":[],"payment_method":"示例文本"}
 */
export interface ReceiptImageOcrExtractOneOutput {
  /** 商家名称，如店铺名、公司名 */
  merchant_name: string;
  /** 交易日期，格式统一为YYYY-MM-DD，未识别到则为空字符串 */
  transaction_date: string;
  /** 总金额，保留两位小数的字符串格式，如"99.90"，未识别到则为空字符串 */
  total_amount: string;
  /** 商品条目列表，items schema: {name: string(商品名称), quantity: string(数量), price: string(单价), amount: string(小计)}，无商品则为空数组 */
  items: unknown[];
  /** 支付方式，如微信支付、支付宝、现金等，未识别到则为空字符串 */
  payment_method: string;
}
// ---- end:receipt_image_ocr_extract_1 ----

// ---- plugin:text_accounting_parse_1 ----
// ============================================================
// 插件 text_accounting_parse_1 (文本记账解析) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface TextAccountingParseOneInput {
  /** 用户输入的自然语言记账文本，例如"咖啡15，电影30" */
  accounting_text: string;
}

/**
 * capabilityClient.load('text_accounting_parse_1').call<TextAccountingParseOneOutput>('textToJson', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { transactions } = result;
 * 返回值形如：
 *   {"transactions":[]}
 */
export interface TextAccountingParseOneOutput {
  /** 交易记录列表，items schema: {amount: Number(消费金额，保留两位小数), category: String(消费分类，可选值：餐饮/交通/娱乐/购物/医疗/教育/住房/其他), remark: String(消费内容备注)} */
  transactions: unknown[];
}
// ---- end:text_accounting_parse_1 ----

// ---- plugin:daily_consumption_roast_summary_1 ----
// ============================================================
// 插件 daily_consumption_roast_summary_1 (每日消费毒舌总结) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface DailyConsumptionRoastSummaryOneInput {
  /** 当天所有交易记录内容 */
  transaction_records: string;
}

/**
 * capabilityClient.load('daily_consumption_roast_summary_1').callStream<DailyConsumptionRoastSummaryOneOutput>('textGenerate', input)
 * 每个 chunk 就是下面这个扁平对象，字段名与 DailyConsumptionRoastSummaryOneOutput 一致，外面没有 data / choices / message 包装：
 *   {"content":"示例文本","response":"示例文本"}
 * 返回值可能是 AsyncIterable<chunk>，也可能是 { output: AsyncIterable<chunk> }，取流前先归一化。
 * 逐段累加：
 *   for await (const chunk of stream) { result += chunk.content ?? ''; }
 */
export interface DailyConsumptionRoastSummaryOneOutput {
  /** [object Object] */
  content: string;
  /** [object Object] */
  response?: string;
}
// ---- end:daily_consumption_roast_summary_1 ----