import { Trash2, Pencil } from 'lucide-react';
import type { ITransaction } from '@/data/transaction';
import { CATEGORY_MAP } from '@/lib/categories';

interface TransactionCardProps {
  transaction: ITransaction;
  onDelete?: (id: string) => void;
  onEdit?: (id: string) => void;
  compact?: boolean;
}

export default function TransactionCard({
  transaction,
  onDelete,
  onEdit,
  compact = false,
}: TransactionCardProps) {
  const cat = CATEGORY_MAP[transaction.category];
  const isExpense = transaction.type === 'expense';

  return (
    <div
      className={`relative flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-[#F0E6DD] ${
        compact ? 'gap-2 p-2.5' : ''
      }`}
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${cat.bgClass} text-xl`}
      >
        {cat.emoji}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-[#5C4A3D]">
            {transaction.note || cat.label}
          </span>
          <span
            className={`shrink-0 tabular-nums ${
              isExpense
                ? 'font-semibold text-[#E89AAD]'
                : 'font-semibold text-[#6FA87A]'
            } ${compact ? 'text-sm' : 'text-base'}`}
          >
            {isExpense ? '-' : '+'}¥{transaction.amount.toFixed(2)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-[#A8988A]">
          <span>{cat.label}</span>
          {transaction.merchant && (
            <>
              <span>·</span>
              <span className="truncate">{transaction.merchant}</span>
            </>
          )}
          <span>·</span>
          <span className="shrink-0">
            {transaction.date}
            {transaction.time ? ` ${transaction.time}` : ''}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {onEdit && (
          <button
            type="button"
            onClick={() => onEdit(transaction.id)}
            className="rounded-full p-1.5 text-[#C9B8A8] transition-colors hover:bg-[#EDF6EF] hover:text-[#6FA87A]"
            aria-label="修改"
            title="AI 修改这笔账单"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(transaction.id)}
            className="rounded-full p-1.5 text-[#C9B8A8] transition-colors hover:bg-[#FDECEC] hover:text-[#E87A7A]"
            aria-label="删除"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
