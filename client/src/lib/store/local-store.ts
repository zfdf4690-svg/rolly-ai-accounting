// 本地存储实现 — 基于 scopedStorage（localStorage 封装，自动按 appId 隔离）
// 作为飞书多维表格不可用时的降级方案，同时也是老用户数据迁移的来源

import type { ITransaction, IChatMessage, IDailySummary } from '@/data/transaction';
import type { IDataStore, ExportData, ImportResult } from './index';
import { scopedStorage, logger } from '@lark-apaas/client-toolkit';

const TX_KEY = 'rolly_transactions_v3';
const MSG_KEY = 'rolly_chat_messages_v3';
const SUMMARY_KEY = 'rolly_daily_summary_v3';

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = scopedStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.error(`local-store readJSON ${key} error:`, String(err));
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    scopedStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    logger.error(`local-store writeJSON ${key} error:`, String(err));
  }
}

export async function createLocalStore(): Promise<IDataStore> {
  return {
    isRemote() {
      return false;
    },

    // ========= 交易记录 =========
    async listTransactions(userId: string): Promise<ITransaction[]> {
      const all = readJSON<ITransaction[]>(TX_KEY, []);
      return all
        .filter((t) => t.userId === userId)
        .sort((a, b) => b.createdAt - a.createdAt);
    },

    async createTransaction(tx: ITransaction): Promise<void> {
      const all = readJSON<ITransaction[]>(TX_KEY, []);
      const exists = all.some((t) => t.id === tx.id);
      if (!exists) {
        all.push(tx);
        writeJSON(TX_KEY, all);
      }
    },

    async createTransactions(txs: ITransaction[]): Promise<void> {
      if (txs.length === 0) return;
      const all = readJSON<ITransaction[]>(TX_KEY, []);
      const existingIds = new Set(all.map((t) => t.id));
      const toAdd = txs.filter((t) => !existingIds.has(t.id));
      if (toAdd.length > 0) {
        writeJSON(TX_KEY, [...all, ...toAdd]);
      }
    },

    async deleteTransaction(userId: string, id: string): Promise<void> {
      const all = readJSON<ITransaction[]>(TX_KEY, []);
      const filtered = all.filter((t) => !(t.id === id && t.userId === userId));
      if (filtered.length !== all.length) {
        writeJSON(TX_KEY, filtered);
      }
    },

    async clearTransactions(userId: string): Promise<void> {
      const all = readJSON<ITransaction[]>(TX_KEY, []);
      const filtered = all.filter((t) => t.userId !== userId);
      writeJSON(TX_KEY, filtered);
    },

    // ========= 聊天消息 =========
    async listMessages(userId: string): Promise<IChatMessage[]> {
      const all = readJSON<IChatMessage[]>(MSG_KEY, []);
      return all
        .filter((m) => m.userId === userId)
        .sort((a, b) => a.timestamp - b.timestamp);
    },

    async createMessage(msg: IChatMessage): Promise<void> {
      const all = readJSON<IChatMessage[]>(MSG_KEY, []);
      const exists = all.some((m) => m.id === msg.id);
      if (!exists) {
        all.push(msg);
        writeJSON(MSG_KEY, all);
      }
    },

    async updateMessage(msg: IChatMessage): Promise<void> {
      const all = readJSON<IChatMessage[]>(MSG_KEY, []);
      const idx = all.findIndex((m) => m.id === msg.id && m.userId === msg.userId);
      if (idx !== -1) {
        all[idx] = msg;
        writeJSON(MSG_KEY, all);
      } else {
        all.push(msg);
        writeJSON(MSG_KEY, all);
      }
    },

    async createMessages(msgs: IChatMessage[]): Promise<void> {
      if (msgs.length === 0) return;
      const all = readJSON<IChatMessage[]>(MSG_KEY, []);
      const existingIds = new Set(all.map((m) => m.id));
      const toAdd = msgs.filter((m) => !existingIds.has(m.id));
      if (toAdd.length > 0) {
        writeJSON(MSG_KEY, [...all, ...toAdd]);
      }
    },

    async clearMessages(userId: string): Promise<void> {
      const all = readJSON<IChatMessage[]>(MSG_KEY, []);
      const filtered = all.filter((m) => m.userId !== userId);
      writeJSON(MSG_KEY, filtered);
    },

    // ========= 每日总结 =========
    async getDailySummary(userId: string, date: string): Promise<string | null> {
      const all = readJSON<Record<string, string>>(SUMMARY_KEY, {});
      return all[`${userId}:${date}`] || null;
    },

    async saveDailySummary(
      userId: string,
      date: string,
      summary: string
    ): Promise<void> {
      const all = readJSON<Record<string, string>>(SUMMARY_KEY, {});
      all[`${userId}:${date}`] = summary;
      writeJSON(SUMMARY_KEY, all);
    },

    // ========= 全量导入导出 =========
    async exportAll(userId: string): Promise<ExportData> {
      const [transactions, messages] = await Promise.all([
        this.listTransactions(userId),
        this.listMessages(userId),
      ]);
      return {
        version: 1,
        exportedAt: new Date().toISOString(),
        transactions,
        messages,
      };
    },

    async importAll(userId: string, data: ExportData): Promise<ImportResult> {
      if (!data || typeof data !== 'object') {
        throw new Error('数据格式不正确');
      }
      const txs = Array.isArray(data.transactions) ? data.transactions : [];
      const msgs = Array.isArray(data.messages) ? data.messages : [];

      // 确保都带上 userId
      const taggedTxs = txs.map((t) => ({ ...t, userId }));
      const taggedMsgs = msgs.map((m) => ({ ...m, userId }));

      await Promise.all([
        this.clearTransactions(userId),
        this.clearMessages(userId),
      ]);

      if (taggedTxs.length > 0) await this.createTransactions(taggedTxs);
      if (taggedMsgs.length > 0) await this.createMessages(taggedMsgs);

      return {
        transactionCount: taggedTxs.length,
        messageCount: taggedMsgs.length,
      };
    },
  };
}

// 读取本地存储里的旧数据（用于迁移到云端）
export async function readAllLocalData(userId: string): Promise<{
  transactions: ITransaction[];
  messages: IChatMessage[];
}> {
  const allTxs = readJSON<ITransaction[]>(TX_KEY, []);
  const allMsgs = readJSON<IChatMessage[]>(MSG_KEY, []);

  // 兼容老数据：没有 userId 字段的旧记录，补上当前用户 ID
  const txs = allTxs.filter((t) => t.userId === userId || !t.userId);
  const msgs = allMsgs.filter((m) => m.userId === userId || !m.userId);

  const taggedTxs = txs.map((t) => ({ ...t, userId }));
  const taggedMsgs = msgs.map((m) => ({ ...m, userId }));

  return {
    transactions: taggedTxs,
    messages: taggedMsgs,
  };
}
