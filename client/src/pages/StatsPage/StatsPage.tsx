import { useState, useEffect, useMemo, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { useData } from '@/lib/store/useData';
import { CATEGORY_MAP } from '@/lib/categories';
import { CHART_COLORS } from '@/lib/chart-colors';
import EmptyState from '@/components/EmptyState';
import { Loader2 } from 'lucide-react';

export default function StatsPage() {
  const { loading: isLoading, transactions, refreshTransactions } = useData();

  useEffect(() => {
    const handleFocus = () => refreshTransactions();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refreshTransactions]);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

  // 当月数据
  const monthStats = useMemo(() => {
    const monthTxs = transactions.filter(
      (t) => t.date.startsWith(monthPrefix) && t.type === 'expense'
    );
    const total = monthTxs.reduce((sum, t) => sum + t.amount, 0);

    const byCategory: Record<string, number> = {};
    monthTxs.forEach((tx) => {
      byCategory[tx.category] = (byCategory[tx.category] || 0) + tx.amount;
    });

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dailyExpense: number[] = new Array(daysInMonth).fill(0);
    monthTxs.forEach((tx) => {
      const day = parseInt(tx.date.slice(8, 10), 10);
      if (day >= 1 && day <= daysInMonth) {
        dailyExpense[day - 1] += tx.amount;
      }
    });

    return { total, byCategory, dailyExpense, daysInMonth };
  }, [transactions, monthPrefix, year, month]);

  const pieData = useMemo(() => {
    return Object.entries(monthStats.byCategory)
      .map(([key, value]) => ({
        name: CATEGORY_MAP[key as keyof typeof CATEGORY_MAP]?.label || key,
        value: Number(value.toFixed(2)),
      }))
      .sort((a, b) => b.value - a.value);
  }, [monthStats.byCategory]);

  const pieOption: EChartsOption = useMemo(() => {
    return {
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          return `${params.name}<br/>¥${params.value} (${params.percent}%)`;
        },
      },
      legend: {
        type: 'scroll',
        bottom: 0,
        left: 'center',
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { fontSize: 11, color: '#8B7B6D' },
      },
      color: CHART_COLORS,
      series: [
        {
          type: 'pie',
          radius: ['45%', '70%'],
          center: ['50%', '45%'],
          avoidLabelOverlap: false,
          label: { show: false },
          emphasis: { label: { show: false } },
          data: pieData,
        },
      ],
    };
  }, [pieData]);

  const barOption: EChartsOption = useMemo(() => {
    const days = Array.from({ length: monthStats.daysInMonth }, (_, i) => `${i + 1}日`);
    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params;
          return `${p.name}<br/>支出: ¥${p.value}`;
        },
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '20%',
        top: '10%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: days,
        axisLabel: {
          fontSize: 9,
          color: '#A8988A',
          interval: 4,
        },
        axisLine: { lineStyle: { color: '#F0E6DD' } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          fontSize: 10,
          color: '#A8988A',
          formatter: (v: number) => `¥${v}`,
        },
        splitLine: { lineStyle: { color: '#F0E6DD', type: 'dashed' } },
      },
      series: [
        {
          type: 'bar',
          data: monthStats.dailyExpense,
          barWidth: '60%',
          itemStyle: {
            color: '#F5B7A0',
            borderRadius: [4, 4, 0, 0],
          },
        },
      ],
    };
  }, [monthStats.dailyExpense, monthStats.daysInMonth]);

  const hasData = monthStats.total > 0;

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
    <div className="min-h-full bg-[#FFF9F3] px-4 py-4">
      {/* 标题 */}
      <h1 className="mb-4 text-xl font-bold text-[#5C4A3D]">统计</h1>

      {/* 当月总支出 */}
      <div className="mb-4 overflow-hidden rounded-2xl bg-gradient-to-br from-[#FFD6DF] to-[#FFE8DE] p-5 shadow-sm">
        <p className="text-sm text-[#8B7B6D]">当月总支出</p>
        <p className="mt-1 text-3xl font-black text-[#D45A7A] tabular-nums tracking-tight">
          ¥{monthStats.total.toFixed(2)}
        </p>
        <p className="mt-1 text-xs text-[#A8877A]">
          {year} 年 {month + 1} 月
        </p>
      </div>

      {!hasData ? (
        <EmptyState
          title="这个月还没记账哦～"
          description="去记一笔回来看看你的消费结构吧 📊"
        />
      ) : (
        <div className="space-y-4">
          {/* 分类饼图 */}
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#F0E6DD]">
            <h2 className="mb-2 text-sm font-semibold text-[#5C4A3D]">
              分类占比
            </h2>
            <ReactECharts
              option={pieOption}
              theme="ud"
              className="h-[280px] w-full"
            />
          </div>

          {/* 每日柱状图 */}
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#F0E6DD]">
            <h2 className="mb-2 text-sm font-semibold text-[#5C4A3D]">
              每日支出趋势
            </h2>
            <ReactECharts
              option={barOption}
              theme="ud"
              className="h-[260px] w-full"
            />
          </div>

          {/* 分类明细 */}
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#F0E6DD]">
            <h2 className="mb-3 text-sm font-semibold text-[#5C4A3D]">
              分类明细
            </h2>
            <div className="space-y-2.5">
              {pieData.map((item) => {
                const percent = monthStats.total
                  ? (item.value / monthStats.total) * 100
                  : 0;
                const catKey = Object.keys(CATEGORY_MAP).find(
                  (k) => CATEGORY_MAP[k as keyof typeof CATEGORY_MAP].label === item.name
                ) as keyof typeof CATEGORY_MAP | undefined;
                const cat = catKey ? CATEGORY_MAP[catKey] : CATEGORY_MAP.other;

                return (
                  <div key={item.name} className="flex items-center gap-3">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${cat.bgClass} text-base`}
                    >
                      {cat.emoji}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-[#5C4A3D]">{item.name}</span>
                        <span className="shrink-0 text-sm font-medium tabular-nums text-[#E89AAD]">
                          ¥{item.value.toFixed(2)}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#F5EDE5]">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${percent}%`, backgroundColor: cat.color }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
