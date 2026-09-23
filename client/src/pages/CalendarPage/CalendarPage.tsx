import { useState, useMemo, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Sparkles } from 'lucide-react';
import { logger } from '@lark-apaas/client-toolkit';
import { streamDailySummary } from '@/api/rolly';
import { useData } from '@/lib/store/useData';
import TransactionCard from '@/components/TransactionCard';
import EmptyState from '@/components/EmptyState';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

export default function CalendarPage() {
  const { loading: isLoading, transactions, refreshTransactions, getSummary, saveSummary } = useData();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [summary, setSummary] = useState<string>('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  useEffect(() => {
    const handleFocus = () => {
      refreshTransactions();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refreshTransactions]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthData = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    const monthTxs = transactions.filter((t) => t.date.startsWith(prefix));
    const byDay: Record<string, { expense: number; income: number }> = {};
    let totalIncome = 0;
    let totalExpense = 0;

    monthTxs.forEach((tx) => {
      if (!byDay[tx.date]) byDay[tx.date] = { expense: 0, income: 0 };
      if (tx.type === 'expense') {
        byDay[tx.date].expense += tx.amount;
        totalExpense += tx.amount;
      } else {
        byDay[tx.date].income += tx.amount;
        totalIncome += tx.amount;
      }
    });

    return { byDay, totalIncome, totalExpense, balance: totalIncome - totalExpense };
  }, [transactions, year, month]);

  const calendarCells = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startWeekday = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    const cells: { date: string | null; day: number | null; isToday: boolean }[] = [];

    for (let i = 0; i < startWeekday; i++) {
      cells.push({ date: null, day: null, isToday: false });
    }

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        date: dateStr,
        day: d,
        isToday: dateStr === todayStr,
      });
    }

    return cells;
  }, [year, month]);

  const selectedTxs = useMemo(() => {
    if (!selectedDate) return [];
    return transactions
      .filter((t) => t.date === selectedDate)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [transactions, selectedDate]);

  const selectedDayExpense = useMemo(() => {
    if (!selectedDate) return 0;
    return selectedTxs
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [selectedDate, selectedTxs]);

  // 打开日期卡片
  const openDaySheet = useCallback(
    async (date: string) => {
      setSelectedDate(date);
      setSheetOpen(true);
      setSummary('');
      setIsGeneratingSummary(false);

      // 先尝试从数据库读缓存
      try {
        const cached = await getSummary(date);
        if (cached) {
          setSummary(cached);
          return;
        }
      } catch (err) {
        logger.error('getDailySummary error:', String(err));
      }

      // 有交易就生成 AI 总结
      const dayTxs = transactions.filter((t) => t.date === date);
      if (dayTxs.length === 0) return;

      setIsGeneratingSummary(true);
      try {
        const txText = dayTxs
          .map((t) => `${t.note || '消费'} ¥${t.amount.toFixed(2)} (${t.category})`)
          .join('\n');

        let full = '';
        await streamDailySummary(txText, (piece) => {
          full += piece;
          setSummary(full);
        });

        // 流式结束后存数据库
        if (full) {
          await saveSummary(date, full);
        }
      } catch (err) {
        logger.error('generateDailySummary error:', String(err));
        setSummary('呃……今天脑子转不动，先不点评了，反正你花得也不少 😵');
      } finally {
        setIsGeneratingSummary(false);
      }
    },
    [transactions]
  );

  const prevMonth = useCallback(() => {
    setCurrentDate(new Date(year, month - 1, 1));
    setSelectedDate(null);
  }, [year, month]);

  const nextMonth = useCallback(() => {
    setCurrentDate(new Date(year, month + 1, 1));
    setSelectedDate(null);
  }, [year, month]);

  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

  if (isLoading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[#FFF9F3] py-20">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-[#E89AAD]" />
          <p className="text-sm text-[#A8988A]">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-full bg-[#FFF9F3] px-4 py-4">
      <h1 className="mb-4 text-xl font-bold text-[#5C4A3D]">日历</h1>

      {/* 当月概览 */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-white p-3 text-center shadow-sm ring-1 ring-[#F0E6DD]">
          <p className="text-xs text-[#A8988A]">收入</p>
          <p className="mt-1 text-lg font-bold text-[#6FA87A] tabular-nums">
            ¥{monthData.totalIncome.toFixed(2)}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-3 text-center shadow-sm ring-1 ring-[#F0E6DD]">
          <p className="text-xs text-[#A8988A]">支出</p>
          <p className="mt-1 text-lg font-bold text-[#E89AAD] tabular-nums">
            ¥{monthData.totalExpense.toFixed(2)}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-3 text-center shadow-sm ring-1 ring-[#F0E6DD]">
          <p className="text-xs text-[#A8988A]">结余</p>
          <p
            className={`mt-1 text-lg font-bold tabular-nums ${
              monthData.balance >= 0 ? 'text-[#6FA87A]' : 'text-[#E87A7A]'
            }`}
          >
            ¥{monthData.balance.toFixed(2)}
          </p>
        </div>
      </div>

      {/* 日历卡片 */}
      <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-[#F0E6DD]">
        <div className="mb-3 flex items-center justify-between px-2">
          <button
            type="button"
            onClick={prevMonth}
            className="rounded-full p-1.5 text-[#8B7B6D] transition-colors hover:bg-[#FFF9F3]"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-[#5C4A3D]">
            {year} 年 {month + 1} 月
          </span>
          <button
            type="button"
            onClick={nextMonth}
            className="rounded-full p-1.5 text-[#8B7B6D] transition-colors hover:bg-[#FFF9F3]"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {weekdays.map((w) => (
            <div key={w} className="py-1 text-center text-xs font-medium text-[#A8988A]">
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {calendarCells.map((cell, idx) => {
            if (!cell.date) {
              return <div key={`empty-${idx}`} className="aspect-square" />;
            }
            const dayData = monthData.byDay[cell.date];
            const hasExpense = dayData && dayData.expense > 0;
            const hasIncome = dayData && dayData.income > 0;

            return (
              <Sheet key={cell.date}>
                <SheetTrigger asChild>
                  <button
                    type="button"
                    onClick={() => openDaySheet(cell.date!)}
                    className={`flex aspect-square flex-col items-center justify-center rounded-xl text-xs transition-all ${
                      cell.isToday
                        ? 'bg-[#FFE8DE] text-[#D47C5A]'
                        : 'text-[#5C4A3D] hover:bg-[#FFF9F3]'
                    }`}
                  >
                    <span className="text-sm font-medium">{cell.day}</span>
                    {hasExpense && (
                      <span className="mt-0.5 text-[10px] tabular-nums text-[#E89AAD]">
                        ¥{dayData.expense.toFixed(0)}
                      </span>
                    )}
                    {hasIncome && !hasExpense && (
                      <span className="mt-0.5 text-[10px] tabular-nums text-[#6FA87A]">
                        +¥{dayData.income.toFixed(0)}
                      </span>
                    )}
                  </button>
                </SheetTrigger>
              </Sheet>
            );
          })}
        </div>
      </div>

      {transactions.length === 0 && (
        <div className="mt-8">
          <EmptyState
            title="还没有记账记录哦～"
            description="去首页跟 Rolly 聊聊吧 💬"
          />
        </div>
      )}

      {/* 日详情 Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="!max-h-[85vh] !overflow-hidden !rounded-t-3xl border-0 bg-white/95 p-0 backdrop-blur-xl"
        >
          <div className="flex h-full flex-col">
            {/* 顶部拉手 + 标题 */}
            <div className="shrink-0 px-4 pb-2 pt-3">
              <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-[#E0D3C6]" />
              <SheetHeader className="!p-0">
                <SheetTitle className="text-center text-base font-semibold text-[#5C4A3D]">
                  {selectedDate}
                </SheetTitle>
              </SheetHeader>
              <p className="mt-1 text-center text-xs text-[#A8988A]">
                {selectedTxs.length} 笔交易 · 支出{' '}
                <span className="font-medium text-[#E89AAD]">
                  ¥{selectedDayExpense.toFixed(2)}
                </span>
              </p>
            </div>

            {/* 滚动内容区 */}
            <div className="flex-1 overflow-y-auto px-4 pb-6">
              {/* 交易明细 */}
              <div className="mb-4">
                <h3 className="mb-2 text-sm font-semibold text-[#5C4A3D]">
                  当日明细
                </h3>
                {selectedTxs.length === 0 ? (
                  <div className="rounded-2xl bg-[#FFF9F3] p-6 text-center text-sm text-[#A8988A]">
                    这天没有记录哦～ 🌸
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedTxs.map((tx) => (
                      <TransactionCard key={tx.id} transaction={tx} compact />
                    ))}
                  </div>
                )}
              </div>

              {/* AI 日总结 */}
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-[#5C4A3D]">
                    Rolly 的每日点评
                  </h3>
                  {isGeneratingSummary && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#E89AAD]" />
                  )}
                  <Sparkles className="h-4 w-4 text-[#E89AAD]" />
                </div>
                {selectedTxs.length === 0 ? (
                  <div className="rounded-2xl bg-gradient-to-br from-[#FFE8DE] to-[#FFF0E5] p-4 text-sm text-[#8B7B6D]">
                    今天没花钱，真的假的？我不信 🤨
                  </div>
                ) : summary ? (
                  <div className="rounded-2xl bg-gradient-to-br from-[#FFE8DE] to-[#FFF0E5] p-4 text-sm leading-relaxed text-[#5C4A3D] whitespace-pre-line">
                    {summary}
                  </div>
                ) : (
                  <div className="rounded-2xl bg-gradient-to-br from-[#FFE8DE] to-[#FFF0E5] p-4">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[#E89AAD] [animation-delay:-0.3s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[#E89AAD] [animation-delay:-0.15s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[#E89AAD]" />
                      <span className="ml-2 text-xs text-[#8B7B6D]">
                        Rolly 正在吐槽中...
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
