import type { TransactionCategory } from '@/data/transaction';

export interface CategoryInfo {
  key: TransactionCategory;
  label: string;
  emoji: string;
  color: string; // hex for charts
  bgClass: string; // tailwind bg class for card
  textClass: string;
}

export const CATEGORY_MAP: Record<TransactionCategory, CategoryInfo> = {
  food: {
    key: 'food',
    label: '餐饮',
    emoji: '🍜',
    color: '#F5B7A0',
    bgClass: 'bg-[#FFE8DE]',
    textClass: 'text-[#D47C5A]',
  },
  transport: {
    key: 'transport',
    label: '交通',
    emoji: '🚗',
    color: '#A8D0E6',
    bgClass: 'bg-[#E0F0FA]',
    textClass: 'text-[#5A9BC4]',
  },
  shopping: {
    key: 'shopping',
    label: '购物',
    emoji: '🛍️',
    color: '#F0B8D0',
    bgClass: 'bg-[#FCE4EE]',
    textClass: 'text-[#D47AA3]',
  },
  entertainment: {
    key: 'entertainment',
    label: '娱乐',
    emoji: '🎮',
    color: '#C8B6E2',
    bgClass: 'bg-[#EDE4F7]',
    textClass: 'text-[#8B6FB8]',
  },
  home: {
    key: 'home',
    label: '家居',
    emoji: '🏠',
    color: '#B8D8BE',
    bgClass: 'bg-[#E2F0E4]',
    textClass: 'text-[#6FA87A]',
  },
  health: {
    key: 'health',
    label: '健康',
    emoji: '💊',
    color: '#F7D08A',
    bgClass: 'bg-[#FEF0D6]',
    textClass: 'text-[#D4A04A]',
  },
  other: {
    key: 'other',
    label: '其他',
    emoji: '📦',
    color: '#C9C9C9',
    bgClass: 'bg-[#EEEEEE]',
    textClass: 'text-[#888888]',
  },
};

// 中文分类名 → 内部 key
const LABEL_TO_KEY: Record<string, TransactionCategory> = {
  餐饮: 'food',
  交通: 'transport',
  购物: 'shopping',
  娱乐: 'entertainment',
  家居: 'home',
  住房: 'home',
  健康: 'health',
  医疗: 'health',
  教育: 'other',
  其他: 'other',
};

export function categoryFromLabel(label: string): CategoryInfo {
  const key = LABEL_TO_KEY[label] || 'other';
  return CATEGORY_MAP[key];
}

export const CATEGORY_LIST: CategoryInfo[] = Object.values(CATEGORY_MAP);
