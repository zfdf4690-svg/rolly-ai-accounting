import { scopedStorage, logger } from '@lark-apaas/client-toolkit';
import type { ITransaction, IChatMessage } from '@/data/transaction';

// 匿名用户标识
const USER_ID_KEY = 'rolly_anon_user_id';
const TX_KEY = 'rolly_transactions_v2';
const MSG_KEY = 'rolly_chat_messages_v2';
const SUMMARY_KEY = 'rolly_daily_summary_v2';

let cachedUserId: string | null = null;

export async function getUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;

  let id = scopedStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    scopedStorage.setItem(USER_ID_KEY, id);
  }
  cachedUserId = id;
  return id;
}

// 读 JSON
function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = scopedStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.error(`readJSON ${key} error:`, String(err));
    return fallback;
  }
}

// 写 JSON
function writeJSON(key: string, value: unknown): void {
  try {
    scopedStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    logger.error(`writeJSON ${key} error:`, String(err));
  }
}

// ====== 交易记录 ======

export async function loadTransactions(): Promise<ITransaction[]> {
  const txs = readJSON<ITransaction[]>(TX_KEY, []);
  return txs.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveTransaction(tx: ITransaction): Promise<void> {
  const txs = readJSON<ITransaction[]>(TX_KEY, []);
  const exists = txs.some((t) => t.id === tx.id);
  if (!exists) {
    txs.push(tx);
    writeJSON(TX_KEY, txs);
  }
}

export async function saveTransactions(txs: ITransaction[]): Promise<void> {
  if (txs.length === 0) return;
  const existing = readJSON<ITransaction[]>(TX_KEY, []);
  const existingIds = new Set(existing.map((t) => t.id));
  const toAdd = txs.filter((t) => !existingIds.has(t.id));
  if (toAdd.length > 0) {
    writeJSON(TX_KEY, [...existing, ...toAdd]);
  }
}

export async function deleteTransaction(id: string): Promise<void> {
  const txs = readJSON<ITransaction[]>(TX_KEY, []);
  const filtered = txs.filter((t) => t.id !== id);
  if (filtered.length !== txs.length) {
    writeJSON(TX_KEY, filtered);
  }
}

export async function clearAllTransactions(): Promise<void> {
  writeJSON(TX_KEY, []);
}

// ====== 聊天消息 ======

export async function loadMessages(): Promise<IChatMessage[]> {
  const msgs = readJSON<IChatMessage[]>(MSG_KEY, []);
  return msgs.sort((a, b) => a.timestamp - b.timestamp);
}

export async function saveMessage(msg: IChatMessage): Promise<void> {
  const msgs = readJSON<IChatMessage[]>(MSG_KEY, []);
  const exists = msgs.some((m) => m.id === msg.id);
  if (!exists) {
    msgs.push(msg);
    writeJSON(MSG_KEY, msgs);
  } else {
    // 更新已存在的（用于流式消息内容更新）
    const idx = msgs.findIndex((m) => m.id === msg.id);
    if (idx !== -1) {
      msgs[idx] = msg;
      writeJSON(MSG_KEY, msgs);
    }
  }
}

export async function saveMessages(msgs: IChatMessage[]): Promise<void> {
  if (msgs.length === 0) return;
  const existing = readJSON<IChatMessage[]>(MSG_KEY, []);
  const existingIds = new Set(existing.map((m) => m.id));
  const toAdd = msgs.filter((m) => !existingIds.has(m.id));
  if (toAdd.length > 0) {
    writeJSON(MSG_KEY, [...existing, ...toAdd]);
  }
}

export async function clearAllMessages(): Promise<void> {
  writeJSON(MSG_KEY, []);
}

// ====== 每日消费总结缓存 ======

type SummaryMap = Record<string, string>;

export async function getDailySummary(date: string): Promise<string | null> {
  const map = readJSON<SummaryMap>(SUMMARY_KEY, {});
  return map[date] || null;
}

export async function saveDailySummary(date: string, summary: string): Promise<void> {
  const map = readJSON<SummaryMap>(SUMMARY_KEY, {});
  map[date] = summary;
  writeJSON(SUMMARY_KEY, map);
}

// ====== 全量导入导出 ======

export interface ExportData {
  version: number;
  exportedAt: string;
  transactions: ITransaction[];
  messages: IChatMessage[];
}

export async function exportAllData(): Promise<ExportData> {
  const [transactions, messages] = await Promise.all([
    loadTransactions(),
    loadMessages(),
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    transactions,
    messages,
  };
}

export async function importAllData(data: ExportData): Promise<{
  transactionCount: number;
  messageCount: number;
}> {
  if (!data || typeof data !== 'object') {
    throw new Error('数据格式不正确');
  }
  const txs = Array.isArray(data.transactions) ? data.transactions : [];
  const msgs = Array.isArray(data.messages) ? data.messages : [];

  await Promise.all([clearAllTransactions(), clearAllMessages()]);

  if (txs.length > 0) await saveTransactions(txs);
  if (msgs.length > 0) await saveMessages(msgs);

  return {
    transactionCount: txs.length,
    messageCount: msgs.length,
  };
}

// 工具
export function genId(prefix = 'id'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// 旧版 IndexedDB 数据迁移（兼容老用户）
export async function migrateFromIndexedDB(): Promise<boolean> {
  try {
    const dbName = 'rolly_ai_accounting';
    const hasOld = await new Promise<boolean>((resolve) => {
      const req = indexedDB.open(dbName, 1);
      req.onsuccess = () => {
        const db = req.result;
        const has =
          db.objectStoreNames.contains('transactions') ||
          db.objectStoreNames.contains('messages');
        db.close();
        resolve(has);
      };
      req.onerror = () => resolve(false);
      req.onupgradeneeded = () => {
        req.transaction?.abort();
      };
    });

    if (!hasOld) return false;

    // 检查新存储是否已有数据
    const existingTxs = readJSON<ITransaction[]>(TX_KEY, []);
    if (existingTxs.length > 0) return false;

    const oldTxs = await new Promise<ITransaction[]>((resolve) => {
      const req = indexedDB.open(dbName, 1);
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction('transactions', 'readonly');
          const store = tx.objectStore('transactions');
          const getAllReq = store.getAll();
          getAllReq.onsuccess = () => resolve(getAllReq.result || []);
          getAllReq.onerror = () => resolve([]);
        } catch {
          resolve([]);
        }
      };
      req.onerror = () => resolve([]);
    });

    const oldMsgs = await new Promise<IChatMessage[]>((resolve) => {
      const req = indexedDB.open(dbName, 1);
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction('messages', 'readonly');
          const store = tx.objectStore('messages');
          const getAllReq = store.getAll();
          getAllReq.onsuccess = () => resolve(getAllReq.result || []);
          getAllReq.onerror = () => resolve([]);
        } catch {
          resolve([]);
        }
      };
      req.onerror = () => resolve([]);
    });

    if (oldTxs.length === 0 && oldMsgs.length === 0) return false;

    await saveTransactions(oldTxs);
    await saveMessages(oldMsgs);
    return true;
  } catch (err) {
    logger.warn('migrateFromIndexedDB skipped:', String(err));
    return false;
  }
}
