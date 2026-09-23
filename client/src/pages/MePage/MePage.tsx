import { useState, useRef, useEffect, useCallback } from 'react';
import { Image } from '@/components/ui/image';
import { Download, Upload, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useData } from '@/lib/store/useData';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const ROLLY_AVATAR = '/rolly_avatar.png';

export default function MePage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const { transactions, messages, exportData, importData, removeTransaction, refreshTransactions, refreshMessages, loading } = useData();

  const stats = loading ? null : { txCount: transactions.length, msgCount: messages.length };

  // 导出数据
  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const data = await exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `rolly-记账数据-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('导出成功！记得好好保存哦 💾');
    } catch {
      toast.error('导出失败了，再试试？');
    } finally {
      setIsExporting(false);
    }
  }, []);

  // 选择导入文件
  const handleFilePick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';
      setPendingFile(file);
      setImportConfirmOpen(true);
    },
    []
  );

  // 确认导入
  const confirmImport = useCallback(async () => {
    if (!pendingFile) return;
    setIsImporting(true);
    try {
      const text = await pendingFile.text();
      const data = JSON.parse(text);
      const result = await importData(data);
      toast.success(
        `导入成功！恢复了 ${result.transactionCount} 笔交易和 ${result.messageCount} 条消息 🎉`
      );
      // 导入后数据已由 useData hook 自动刷新
    } catch {
      toast.error('导入失败了，文件格式不对哦～');
    } finally {
      setIsImporting(false);
      setImportConfirmOpen(false);
      setPendingFile(null);
    }
  }, [pendingFile, importData]);

  // 清空数据
  const confirmClear = useCallback(async () => {
    try {
      // 逐条删交易
      await Promise.all(transactions.map((t) => removeTransaction(t.id)));
      await refreshTransactions();
      await refreshMessages();
      toast.success('已清空所有交易数据 🧹');
    } catch {
      toast.error('清空失败了');
    }
    setClearConfirmOpen(false);
  }, [transactions, removeTransaction, refreshTransactions, refreshMessages]);

  return (
    <div className="min-h-full bg-[#FFF9F3] px-4 py-4">
      <h1 className="mb-4 text-xl font-bold text-[#5C4A3D]">我的</h1>

      {/* 用户卡片 */}
      <div className="mb-4 flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#F0E6DD]">
        <div className="h-16 w-16 overflow-hidden rounded-full ring-2 ring-[#FFE8DE]">
          <Image src={ROLLY_AVATAR} alt="Rolly" className="h-full w-full object-cover" />
        </div>
        <div className="flex-1">
          <p className="text-base font-semibold text-[#5C4A3D]">Rolly 的记账本</p>
          <p className="mt-1 text-xs text-[#A8988A]">
            已记录 {stats?.txCount ?? 0} 笔交易 · {stats?.msgCount ?? 0} 条对话
          </p>
        </div>
      </div>

      {/* 数据管理 */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-[#F0E6DD]">
        <p className="px-4 pt-3 text-xs font-medium text-[#A8988A]">数据管理</p>

        <button
          type="button"
          onClick={handleExport}
          disabled={isExporting}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[#FFF9F3] disabled:opacity-50"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E2F0E4] text-[#6FA87A]">
            <Download className="h-4.5 w-4.5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-[#5C4A3D]">导出数据</p>
            <p className="text-xs text-[#A8988A]">
              把所有记账数据导出成 JSON 文件备份
            </p>
          </div>
          <span className="text-xs text-[#C9B8A8]">›</span>
        </button>

        <div className="mx-4 h-px bg-[#F5EDE5]" />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isImporting}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[#FFF9F3] disabled:opacity-50"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FFE8DE] text-[#D47C5A]">
            <Upload className="h-4.5 w-4.5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-[#5C4A3D]">导入数据</p>
            <p className="text-xs text-[#A8988A]">
              从之前导出的 JSON 文件恢复数据
            </p>
          </div>
          <span className="text-xs text-[#C9B8A8]">›</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleFilePick}
        />

        <div className="mx-4 h-px bg-[#F5EDE5]" />

        <button
          type="button"
          onClick={() => setClearConfirmOpen(true)}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[#FFF9F3]"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FDECEC] text-[#E87A7A]">
            <Trash2 className="h-4.5 w-4.5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-[#E87A7A]">清空所有数据</p>
            <p className="text-xs text-[#A8988A]">
              谨慎操作，清空后无法恢复
            </p>
          </div>
          <span className="text-xs text-[#C9B8A8]">›</span>
        </button>
      </div>

      {/* 关于 */}
      <div className="mt-6 text-center">
        <p className="text-xs text-[#C9B8A8]">Rolly AI 记账 v1.0</p>
        <p className="mt-1 text-xs text-[#D9C9BA]">你的毒舌记账闺蜜 💕</p>
      </div>

      {/* 导入确认对话框 */}
      <AlertDialog open={importConfirmOpen} onOpenChange={setImportConfirmOpen}>
        <AlertDialogContent className="max-w-[320px] rounded-2xl border-0 bg-white p-5 shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center text-base font-semibold text-[#5C4A3D]">
              确认导入？
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-sm text-[#A8988A]">
              导入会<strong className="text-[#E87A7A]">覆盖</strong>当前所有数据哦，
              <br />
              确认要用备份文件替换现在的数据吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 flex-row gap-2 sm:gap-2">
            <AlertDialogCancel className="flex-1 rounded-xl border-[#F0E6DD] text-sm text-[#8B7B6D] hover:bg-[#FFF9F3]">
              算了
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmImport}
              disabled={isImporting}
              className="flex-1 rounded-xl bg-[#E89AAD] text-sm text-white hover:bg-[#D48092] disabled:opacity-50"
            >
              {isImporting ? '导入中...' : '确认导入'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 清空确认对话框 */}
      <AlertDialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <AlertDialogContent className="max-w-[320px] rounded-2xl border-0 bg-white p-5 shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center text-base font-semibold text-[#5C4A3D]">
              真的要清空吗？
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-sm text-[#A8988A]">
              清空后所有交易记录都会消失，
              <br />
              建议先导出备份一下哦～
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 flex-row gap-2 sm:gap-2">
            <AlertDialogCancel className="flex-1 rounded-xl border-[#F0E6DD] text-sm text-[#8B7B6D] hover:bg-[#FFF9F3]">
              再想想
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmClear}
              className="flex-1 rounded-xl bg-[#E87A7A] text-sm text-white hover:bg-[#D45A5A]"
            >
              确认清空
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
