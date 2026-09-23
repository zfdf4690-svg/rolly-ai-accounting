import { readAllLocalData } from './local-store';
import { createApiStore } from './api-store';
import { scopedStorage, logger } from '@lark-apaas/client-toolkit';
import { genId } from './utils';

export { genId, readAllLocalData };

export interface IDataStore {
  listTransactions(userId: string): Promise<ITransaction[]>;
  createTransaction(tx: ITransaction): Promise<void>;
  createTransactions(txs: ITransaction[]): Promise<void>;
  updateTransaction(
    userId: string,
    id: string,
    patch: Partial<
      Pick<
        ITransaction,
        'amount' | 'category' | 'categoryEmoji' | 'note' | 'date' | 'time' | 'merchant'
      >
    >
  ): Promise<void>;
  deleteTransaction(userId: string, id: string): Promise<void>;
  clearTransactions(userId: string): Promise<void>;

  listMessages(userId: string): Promise<IChatMessage[]>;
  createMessage(msg: IChatMessage): Promise<void>;
  updateMessage(msg: IChatMessage): Promise<void>;
  createMessages(msgs: IChatMessage[]): Promise<void>;
  clearMessages(userId: string): Promise<void>;

  getDailySummary(userId: string, date: string): Promise<string | null>;
  saveDailySummary(userId: string, date: string, summary: string): Promise<void>;

  exportAll(userId: string): Promise<ExportData>;
  importAll(userId: string, data: ExportData): Promise<ImportResult>;

  isRemote(): boolean;
}

export interface ExportData {
  version: number;
  exportedAt: string;
  transactions: ITransaction[];
  messages: IChatMessage[];
}

export interface ImportResult {
  transactionCount: number;
  messageCount: number;
}

import type { ITransaction, IChatMessage, IDailySummary } from '@/data/transaction';

const USER_ID_KEY = 'rolly_anon_user_id';
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

const MIGRATION_KEY = 'rolly_cloud_migrated_v1';

let storeInstance: IDataStore | null = null;

export async function getDataStore(): Promise<IDataStore> {
  if (storeInstance) return storeInstance;

  storeInstance = createApiStore();
  logger.info('[data-store] using cloud store');

  // One-time migration: move local data to cloud if cloud is empty
  const migrated = scopedStorage.getItem(MIGRATION_KEY);
  if (!migrated) {
    try {
      const txs = await storeInstance.listTransactions('');
      if (txs.length === 0) {
        const userId = await getUserId();
        const localData = await readAllLocalData(userId);
        if (
          localData.transactions.length > 0 ||
          localData.messages.length > 0
        ) {
          await storeInstance.importAll(userId, {
            version: 1,
            exportedAt: new Date().toISOString(),
            transactions: localData.transactions,
            messages: localData.messages,
          });
          logger.info('[data-store] local-to-cloud migration complete');
        }
      }
      scopedStorage.setItem(MIGRATION_KEY, '1');
    } catch (err) {
      logger.error('[data-store] migration error:', String(err));
    }
  }

  return storeInstance;
}
