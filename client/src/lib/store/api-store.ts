import type { ITransaction, IChatMessage } from '@/data/transaction';
import type { IDataStore, ExportData, ImportResult } from './index';
import * as rollyApi from '@/api/rolly';
import type { TransactionDTO, ChatMessageDTO } from '@shared/api.interface';
import { logger } from '@lark-apaas/client-toolkit';

// ---------- DTO ↔ local type mapping ----------

function dtoToTx(dto: TransactionDTO, userId: string): ITransaction {
  return {
    id: dto.id,
    userId,
    type: dto.type as ITransaction['type'],
    amount: dto.amount,
    category: dto.category as ITransaction['category'],
    categoryEmoji: dto.categoryEmoji,
    note: dto.note,
    date: dto.date,
    time: dto.time,
    merchant: dto.merchant,
    source: dto.source as ITransaction['source'],
    createdAt: dto.createdAt,
  };
}

function txToDto(tx: ITransaction): TransactionDTO {
  return {
    id: tx.id,
    type: tx.type,
    amount: tx.amount,
    category: tx.category,
    categoryEmoji: tx.categoryEmoji,
    note: tx.note,
    date: tx.date,
    time: tx.time,
    merchant: tx.merchant,
    source: tx.source,
    createdAt: tx.createdAt,
  };
}

function dtoToMsg(dto: ChatMessageDTO, userId: string): IChatMessage {
  return {
    id: dto.id,
    userId,
    role: dto.role,
    type: dto.type as IChatMessage['type'],
    content: dto.content,
    transactionIds: dto.transactionIds,
    imageUrl: dto.imageUrl,
    timestamp: dto.createdAt,
  };
}

function msgToDto(msg: IChatMessage): ChatMessageDTO {
  return {
    id: msg.id,
    role: msg.role,
    type: msg.type,
    content: msg.content,
    transactionIds: msg.transactionIds,
    imageUrl: msg.imageUrl,
    createdAt: msg.timestamp,
  };
}

// ---------- store implementation ----------

export function createApiStore(): IDataStore {
  return {
    isRemote(): boolean {
      return true;
    },

    // ========= 交易记录 =========
    async listTransactions(userId: string): Promise<ITransaction[]> {
      const dtos = await rollyApi.listTransactions();
      return dtos
        .map((d) => dtoToTx(d, userId))
        .sort((a, b) => b.createdAt - a.createdAt);
    },

    async createTransaction(tx: ITransaction): Promise<void> {
      await rollyApi.createTransactions([txToDto(tx)]);
    },

    async createTransactions(txs: ITransaction[]): Promise<void> {
      if (txs.length === 0) return;
      await rollyApi.createTransactions(txs.map(txToDto));
    },

    async deleteTransaction(_userId: string, id: string): Promise<void> {
      await rollyApi.deleteTransaction(id);
    },

    async updateTransaction(
      _userId: string,
      id: string,
      patch: Parameters<IDataStore['updateTransaction']>[2]
    ): Promise<void> {
      await rollyApi.updateTransaction(id, patch as Record<string, unknown>);
    },

    async clearTransactions(_userId: string): Promise<void> {
      const dtos = await rollyApi.listTransactions();
      for (const d of dtos) {
        await rollyApi.deleteTransaction(d.id);
      }
    },

    // ========= 聊天消息 =========
    async listMessages(userId: string): Promise<IChatMessage[]> {
      const dtos = await rollyApi.listMessages();
      return dtos
        .map((d) => dtoToMsg(d, userId))
        .sort((a, b) => a.timestamp - b.timestamp);
    },

    async createMessage(msg: IChatMessage): Promise<void> {
      await rollyApi.createMessages([msgToDto(msg)]);
    },

    async createMessages(msgs: IChatMessage[]): Promise<void> {
      if (msgs.length === 0) return;
      await rollyApi.createMessages(msgs.map(msgToDto));
    },

    async updateMessage(msg: IChatMessage): Promise<void> {
      await rollyApi.updateMessage(msg.id, msg.content);
    },

    async clearMessages(_userId: string): Promise<void> {
      const dtos = await rollyApi.listMessages();
      // 消息没有 delete API，无法直接清空。
      // importAll 会清空全部，这里只清消息的话，
      // 通过 updateMessage 无法批量删除，直接跳过。
      logger.info(
        `api-store clearMessages: ${dtos.length} messages, no batch-delete API available; skipping.`
      );
    },

    // ========= 每日总结 =========
    async getDailySummary(_userId: string, date: string): Promise<string | null> {
      const res = await rollyApi.getSummary(date);
      return res.summary ?? null;
    },

    async saveDailySummary(
      _userId: string,
      date: string,
      summary: string
    ): Promise<void> {
      await rollyApi.saveSummary(date, summary);
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

    async importAll(_userId: string, data: ExportData): Promise<ImportResult> {
      const txs = Array.isArray(data.transactions) ? data.transactions : [];
      const msgs = Array.isArray(data.messages) ? data.messages : [];

      const res = await rollyApi.importAll({
        transactions: txs.map(txToDto),
        messages: msgs.map(msgToDto),
      });

      return {
        transactionCount: res.transactionCount,
        messageCount: res.messageCount,
      };
    },
  };
}