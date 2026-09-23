import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import { getDataStore, getUserId, genId } from './index';
import type { IDataStore, ExportData, ImportResult } from './index';
import type { ITransaction, IChatMessage } from '@/data/transaction';
import { logger } from '@lark-apaas/client-toolkit';

/**
 * 全局消息状态（跨页面共享）：
 * 流式生成（AI 吐槽/总结）会持续调用 updateMessageContent 更新消息内容，
 * 若把 messages 放在组件级 useState，切换页面（组件卸载）后流式回调
 * 只能写后端、无法推送到重新挂载的页面，导致"生成中切走再回来内容丢失"。
 * 这里用模块级 store + useSyncExternalStore，页面卸载不丢流、切回实时可见。
 */
let globalMessages: IChatMessage[] = [];
const messageListeners = new Set<() => void>();

function emitMessages(): void {
  messageListeners.forEach((l) => l());
}

function setGlobalMessages(
  updater: (prev: IChatMessage[]) => IChatMessage[]
): void {
  globalMessages = updater(globalMessages);
  emitMessages();
}

function subscribeMessages(listener: () => void): () => void {
  messageListeners.add(listener);
  return () => {
    messageListeners.delete(listener);
  };
}

function getMessagesSnapshot(): IChatMessage[] {
  return globalMessages;
}

/** 把后端拉取的消息与全局状态合并：流式进行中的消息保留全局版本（内容更新中），
 *  后端独有的新消息并入；避免重新挂载 fetch 覆盖正在生成的流。 */
function mergeMessages(remote: IChatMessage[]): void {
  setGlobalMessages((prev) => {
    const byId = new Map<string, IChatMessage>();
    remote.forEach((m) => byId.set(m.id, m));
    prev.forEach((m) => {
      if (byId.has(m.id)) byId.set(m.id, m); // 全局更新中的版本优先
    });
    return [...byId.values()].sort((a, b) => a.timestamp - b.timestamp);
  });
}

/**
 * 全局"流式生成中"消息 id 集合：
 * AI 吐槽/总结为 SSE 流式输出，期间消息 content 为空；
 * 渲染时据此区分"正在输入..."与"生成中断的孤儿空消息"（防止卡死）。
 */
let streamingMsgIds = new Set<string>();
const streamingListeners = new Set<() => void>();

function emitStreaming(): void {
  streamingListeners.forEach((l) => l());
}

function subscribeStreaming(listener: () => void): () => void {
  streamingListeners.add(listener);
  return () => {
    streamingListeners.delete(listener);
  };
}

function getStreamingSnapshot(): ReadonlySet<string> {
  return streamingMsgIds;
}

export function startStreaming(id: string): void {
  streamingMsgIds = new Set(streamingMsgIds).add(id);
  emitStreaming();
}

export function endStreaming(id: string): void {
  if (!streamingMsgIds.has(id)) return;
  streamingMsgIds = new Set(streamingMsgIds);
  streamingMsgIds.delete(id);
  emitStreaming();
}

interface UseDataState {
  loading: boolean;
  store: IDataStore | null;
  userId: string;
}

interface UseDataReturn extends UseDataState {
  transactions: ITransaction[];
  addTransaction: (tx: Omit<ITransaction, 'id' | 'userId' | 'createdAt'>) => Promise<string>;
  addTransactions: (txs: Array<Omit<ITransaction, 'id' | 'userId' | 'createdAt'>>) => Promise<string[]>;
  updateTransaction: (
    id: string,
    patch: Partial<Pick<ITransaction, 'amount' | 'category' | 'categoryEmoji' | 'note' | 'date' | 'time' | 'merchant'>>
  ) => Promise<void>;
  removeTransaction: (id: string) => Promise<void>;
  refreshTransactions: () => Promise<void>;

  messages: IChatMessage[];
  streamingIds: ReadonlySet<string>;
  addMessage: (msg: any) => Promise<string>;
  updateMessageContent: (id: string, content: string) => Promise<void>;
  refreshMessages: () => Promise<void>;

  getSummary: (date: string) => Promise<string | null>;
  saveSummary: (date: string, summary: string) => Promise<void>;

  exportData: () => Promise<ExportData>;
  importData: (data: ExportData) => Promise<ImportResult>;
}

export function useData(): UseDataReturn {
  const [state, setState] = useState<UseDataState>({
    loading: true,
    store: null,
    userId: '',
  });

  const [transactions, setTransactions] = useState<ITransaction[]>([]);
  // messages 为全局共享状态：流式生成跨页面持续更新，卸载不丢
  const messages = useSyncExternalStore(
    subscribeMessages,
    getMessagesSnapshot
  );
  // 流式生成中的消息 id（跨页面共享，用于渲染"正在输入..."区分）
  const streamingIds = useSyncExternalStore(
    subscribeStreaming,
    getStreamingSnapshot
  );

  const storeRef = useRef<IDataStore | null>(null);
  const userIdRef = useRef<string>('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [userId, store] = await Promise.all([
          getUserId(),
          getDataStore(),
        ]);

        if (cancelled) return;

        storeRef.current = store;
        userIdRef.current = userId;

        const [txs, msgs] = await Promise.all([
          store.listTransactions(userId),
          store.listMessages(userId),
        ]);

        if (cancelled) return;

        setTransactions(txs);
        mergeMessages(msgs);
        setState({
          loading: false,
          store,
          userId,
        });
      } catch (err) {
        logger.error('useData init error:', String(err));
        if (!cancelled) {
          setState((s) => ({ ...s, loading: false }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshTransactions = useCallback(async () => {
    if (!storeRef.current || !userIdRef.current) return;
    try {
      const txs = await storeRef.current.listTransactions(userIdRef.current);
      setTransactions(txs);
    } catch (err) {
      logger.error('refreshTransactions error:', String(err));
    }
  }, []);

  const addTransaction = useCallback(async (
    tx: Omit<ITransaction, 'id' | 'userId' | 'createdAt'>
  ): Promise<string> => {
    if (!storeRef.current || !userIdRef.current) {
      throw new Error('Data store not ready');
    }
    const id = genId('tx');
    const newTx: ITransaction = {
      ...tx,
      id,
      userId: userIdRef.current,
      createdAt: Date.now(),
    };
    await storeRef.current.createTransaction(newTx);
    setTransactions((prev) => [newTx, ...prev].sort((a, b) => b.createdAt - a.createdAt));
    return id;
  }, []);

  const addTransactions = useCallback(async (
    txs: Array<Omit<ITransaction, 'id' | 'userId' | 'createdAt'>>
  ): Promise<string[]> => {
    if (!storeRef.current || !userIdRef.current) {
      throw new Error('Data store not ready');
    }
    const now = Date.now();
    const newTxs: ITransaction[] = txs.map((t, i) => ({
      ...t,
      id: genId('tx'),
      userId: userIdRef.current,
      createdAt: now + i,
    }));
    await storeRef.current.createTransactions(newTxs);
    setTransactions((prev) =>
      [...newTxs, ...prev].sort((a, b) => b.createdAt - a.createdAt)
    );
    return newTxs.map((t) => t.id);
  }, []);

  const removeTransaction = useCallback(async (id: string): Promise<void> => {
    if (!storeRef.current || !userIdRef.current) return;
    try {
      await storeRef.current.deleteTransaction(userIdRef.current, id);
      setTransactions((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      logger.error('removeTransaction error:', String(err));
      throw err;
    }
  }, []);

  const updateTransaction = useCallback(
    async (
      id: string,
      patch: Parameters<UseDataReturn['updateTransaction']>[1]
    ): Promise<void> => {
      if (!storeRef.current || !userIdRef.current) return;
      try {
        await storeRef.current.updateTransaction(userIdRef.current, id, patch);
        setTransactions((prev) =>
          prev.map((t) => (t.id === id ? { ...t, ...patch } : t))
        );
      } catch (err) {
        logger.error('updateTransaction error:', String(err));
        throw err;
      }
    },
    []
  );

  const refreshMessages = useCallback(async () => {
    if (!storeRef.current || !userIdRef.current) return;
    try {
      const msgs = await storeRef.current.listMessages(userIdRef.current);
      mergeMessages(msgs);
    } catch (err) {
      logger.error('refreshMessages error:', String(err));
    }
  }, []);

  const addMessage = useCallback(async (
    msg: any
  ): Promise<string> => {
    if (!storeRef.current || !userIdRef.current) {
      throw new Error('Data store not ready');
    }
    const id = msg.id || genId('msg');
    const newMsg: IChatMessage = {
      ...msg,
      id,
      userId: userIdRef.current,
      timestamp: msg.timestamp ?? Date.now(),
    };
    await storeRef.current.createMessage(newMsg);
    setGlobalMessages((prev) =>
      [...prev, newMsg].sort((a, b) => a.timestamp - b.timestamp)
    );
    return id;
  }, []);

  const updateMessageContent = useCallback(async (
    id: string,
    content: string
  ): Promise<void> => {
    if (!storeRef.current || !userIdRef.current) return;
    const msg = globalMessages.find((m) => m.id === id);
    if (!msg) return;
    const updated = { ...msg, content };
    // 先本地全局更新（跨页面实时可见），再异步持久化后端
    setGlobalMessages((prev) =>
      prev.map((m) => (m.id === id ? updated : m))
    );
    storeRef.current.updateMessage(updated).catch((err) => {
      logger.error('updateMessageContent error:', String(err));
    });
  }, []);

  const getSummary = useCallback(async (date: string): Promise<string | null> => {
    if (!storeRef.current || !userIdRef.current) return null;
    return storeRef.current.getDailySummary(userIdRef.current, date);
  }, []);

  const saveSummary = useCallback(async (date: string, summary: string): Promise<void> => {
    if (!storeRef.current || !userIdRef.current) return;
    await storeRef.current.saveDailySummary(userIdRef.current, date, summary);
  }, []);

  const exportData = useCallback(async (): Promise<ExportData> => {
    if (!storeRef.current || !userIdRef.current) {
      throw new Error('Data store not ready');
    }
    return storeRef.current.exportAll(userIdRef.current);
  }, []);

  const importData = useCallback(async (data: ExportData): Promise<ImportResult> => {
    if (!storeRef.current || !userIdRef.current) {
      throw new Error('Data store not ready');
    }
    const result = await storeRef.current.importAll(userIdRef.current, data);
    const [txs, msgs] = await Promise.all([
      storeRef.current.listTransactions(userIdRef.current),
      storeRef.current.listMessages(userIdRef.current),
    ]);
    setTransactions(txs);
    setGlobalMessages(() => msgs); // 导入后以后端为准，整体替换
    return result;
  }, []);

  return {
    ...state,
    transactions,
    messages,
    streamingIds,
    addTransaction,
    addTransactions,
    updateTransaction,
    removeTransaction,
    refreshTransactions,
    addMessage,
    updateMessageContent,
    refreshMessages,
    getSummary,
    saveSummary,
    exportData,
    importData,
  };
}
