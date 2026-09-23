/* 前后端共享的类型写在这里 */

// ========= Rolly 记账 — 云端存储 API 契约 =========
// 后端路由前缀: /api/rolly
// 用户身份一律由服务端从 req.userContext 获取，前端不传 userId

/** 交易记录（前后端统一结构） */
export interface TransactionDTO {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  categoryEmoji: string;
  note?: string;
  date: string;
  time?: string;
  merchant?: string;
  source: string;
  /** 毫秒时间戳，用于排序 */
  createdAt: number;
}

/** 聊天消息（前后端统一结构） */
export interface ChatMessageDTO {
  id: string;
  role: 'user' | 'ai';
  type: string;
  content: string;
  transactionIds?: string[];
  imageUrl?: string;
  /** 毫秒时间戳 */
  createdAt: number;
}

// ---------- 交易 ----------

/** GET /api/rolly/transactions */
export interface ListTransactionsResponse {
  items: TransactionDTO[];
}

/** POST /api/rolly/transactions（批量创建，单条也走这里） */
export interface CreateTransactionsRequest {
  transactions: TransactionDTO[];
}

export interface CreateTransactionsResponse {
  createdCount: number;
}

/** DELETE /api/rolly/transactions/:id */
export interface DeleteTransactionResponse {
  success: boolean;
}

/** PATCH /api/rolly/transactions/:id（AI 修改账单审核确认后更新） */
export interface UpdateTransactionRequest {
  amount?: number;
  category?: string;
  categoryEmoji?: string;
  note?: string;
  date?: string;
  time?: string;
  merchant?: string;
}

export interface UpdateTransactionResponse {
  success: boolean;
}

// ---------- 聊天消息 ----------

/** GET /api/rolly/messages */
export interface ListMessagesResponse {
  items: ChatMessageDTO[];
}

/** POST /api/rolly/messages（批量创建） */
export interface CreateMessagesRequest {
  messages: ChatMessageDTO[];
}

export interface CreateMessagesResponse {
  createdCount: number;
}

/** PATCH /api/rolly/messages/:id */
export interface UpdateMessageRequest {
  content: string;
}

export interface UpdateMessageResponse {
  success: boolean;
}

// ---------- 每日总结 ----------

/** GET /api/rolly/summaries?date=YYYY-MM-DD */
export interface GetSummaryResponse {
  date: string;
  summary: string | null;
}

/** PUT /api/rolly/summaries（upsert） */
export interface SaveSummaryRequest {
  date: string;
  summary: string;
}

export interface SaveSummaryResponse {
  success: boolean;
}

// ---------- 全量导入 ----------

/** POST /api/rolly/import（清空当前用户的交易与消息后重新写入） */
export interface ImportAllRequest {
  transactions: TransactionDTO[];
  messages: ChatMessageDTO[];
}

export interface ImportAllResponse {
  transactionCount: number;
  messageCount: number;
}
