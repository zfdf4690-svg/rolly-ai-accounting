// EXPORTS: ITransaction, IChatMessage, IDailySummary, TransactionCategory, TransactionType, TransactionSource, ChatRole, ChatMessageType, MOCK_TRANSACTIONS, MOCK_CHAT_MESSAGES

export type TransactionCategory =
  | 'food'
  | 'transport'
  | 'shopping'
  | 'entertainment'
  | 'home'
  | 'health'
  | 'other';

export type TransactionType = 'income' | 'expense';
export type TransactionSource = 'text' | 'voice' | 'receipt' | 'mock';

export interface ITransaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  category: TransactionCategory;
  categoryEmoji: string;
  note?: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm
  merchant?: string;
  source: TransactionSource;
  createdAt: number;
}

export type ChatRole = 'user' | 'ai';
export type ChatMessageType =
  | 'text'
  | 'transaction-card'
  | 'image'
  | 'modify-preview';

export interface IChatMessage {
  id: string;
  userId: string;
  role: ChatRole;
  type: ChatMessageType;
  content: string;
  transactionIds?: string[];
  imageUrl?: string;
  timestamp: number;
}

export interface IDailySummary {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  summary: string;
  createdAt: number;
  updatedAt: number;
}

const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, '0');
const dd = String(today.getDate()).padStart(2, '0');
const todayStr = `${yyyy}-${mm}-${dd}`;

const yesterday = new Date(today);
yesterday.setDate(yesterday.getDate() - 1);
const yesterdayStr = `${yyyy}-${mm}-${String(yesterday.getDate()).padStart(2, '0')}`;

export const MOCK_TRANSACTIONS: ITransaction[] = [
  {
    id: 'tx_1',
    userId: 'demo',
    type: 'expense',
    amount: 28.0,
    category: 'food',
    categoryEmoji: '🍜',
    note: '星巴克拿铁',
    date: todayStr,
    time: '09:30',
    merchant: '星巴克',
    source: 'mock',
    createdAt: today.getTime() - 3600_000 * 3,
  },
  {
    id: 'tx_2',
    userId: 'demo',
    type: 'expense',
    amount: 45.0,
    category: 'entertainment',
    categoryEmoji: '🎮',
    note: '电影票',
    date: yesterdayStr,
    time: '19:00',
    merchant: '万达影城',
    source: 'mock',
    createdAt: yesterday.getTime() - 3600_000 * 5,
  },
  {
    id: 'tx_3',
    userId: 'demo',
    type: 'expense',
    amount: 128.0,
    category: 'shopping',
    categoryEmoji: '🛍️',
    note: '新杯子',
    date: yesterdayStr,
    time: '14:20',
    merchant: '无印良品',
    source: 'mock',
    createdAt: yesterday.getTime() - 3600_000 * 10,
  },
];

export const MOCK_CHAT_MESSAGES: IChatMessage[] = [
  {
    id: 'msg_welcome',
    userId: 'demo',
    role: 'ai',
    type: 'text',
    content: '哈喽～我是你的记账闺蜜 Rolly 👋\n把你的消费随手说给我听吧，比如「咖啡15，打车30」，我帮你记好～',
    timestamp: Date.now() - 86400_000,
  },
  {
    id: 'msg_user_1',
    userId: 'demo',
    role: 'user',
    type: 'text',
    content: '星巴克拿铁28',
    timestamp: Date.now() - 3600_000 * 3,
  },
  {
    id: 'msg_ai_card_1',
    userId: 'demo',
    role: 'ai',
    type: 'transaction-card',
    content: '',
    transactionIds: ['tx_1'],
    timestamp: Date.now() - 3600_000 * 3 + 1000,
  },
  {
    id: 'msg_ai_1',
    userId: 'demo',
    role: 'ai',
    type: 'text',
    content: '又喝咖啡？你这周第三杯了啊……☕\n行吧行吧，给你记上了。\n不过提醒一下，喝太多晚上容易失眠哦～',
    timestamp: Date.now() - 3600_000 * 3 + 2000,
  },
];
