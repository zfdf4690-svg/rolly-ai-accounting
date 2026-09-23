import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image } from '@/components/ui/image';
import { Input } from '@/components/ui/input';
import { Mic, Camera, Send, Loader2, AudioLines } from 'lucide-react';
import { logger } from '@lark-apaas/client-toolkit';
import { parseText, ocrReceipt, streamRoast, parseModify, updateTransaction } from '@/api/rolly';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  ITransaction,
  IChatMessage,
} from '@/data/transaction';
import { useData, startStreaming, endStreaming } from '@/lib/store/useData';
import { genId } from '@/lib/store/utils';
import { categoryFromLabel } from '@/lib/categories';
import TransactionCard from '@/components/TransactionCard';
import DeleteConfirmDialog from '@/components/DeleteConfirmDialog';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet';

const ROLLY_AVATAR = '/rolly_avatar.png';

export default function ChatPage() {
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);

  // 待记账上下文：多轮追问时暂存已提取字段 / 追问轮数 / 对话历史（字段齐全建卡后清空）
  const [pendingContext, setPendingContext] = useState<{
    partialFields: Record<string, unknown>;
    rounds: number;
    history: { role: 'user' | 'ai'; content: string }[];
  } | null>(null);

  // 修改模式：正在修改的交易 id（点击卡片 ✏️ 进入，审核确认/取消后退出）
  const [editingTxId, setEditingTxId] = useState<string | null>(null);

  const {
    loading: isLoading,
    transactions,
    messages,
    streamingIds,
    addTransaction,
    addTransactions,
    updateTransaction,
    removeTransaction,
    addMessage,
    updateMessageContent,
  } = useData();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const finalTranscriptRef = useRef<string>('');
  const permissionCheckedRef = useRef(false);
  const recordingRef = useRef(false); // 用 ref 存录音状态，避免闭包和竞态
  const stoppingRef = useRef(false); // 正在结束录音（等 onend 结算）
  const submitVoiceTextRef = useRef<(text: string) => void>(() => {});

  // 今日概览
  const todayStats = useMemo(() => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const todayTxs = transactions.filter((t) => t.date === todayStr);
    const expense = todayTxs
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    const income = todayTxs
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    return {
      date: todayStr,
      count: todayTxs.length,
      expense,
      income,
    };
  }, [transactions]);

  // 初始化：语音识别检测
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // 检测语音识别支持
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (SR) {
      setSpeechSupported(true);
      const rec = new SR();
      rec.lang = 'zh-CN';
      // 按住说话需要 continuous + interimResults 实时显示
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onresult = (e: any) => {
        let interim = '';
        let finalText = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const transcript = e.results[i][0].transcript;
          if (e.results[i].isFinal) {
            finalText += transcript;
          } else {
            interim += transcript;
          }
        }
        if (finalText) {
          finalTranscriptRef.current += finalText;
        }
        // 实时显示（最终结果 + 临时结果）
        setInputText(finalTranscriptRef.current + interim);
      };

      rec.onend = () => {
        setIsRecording(false);
        recordingRef.current = false;
        stoppingRef.current = false;
        // 统一在 onend 结算：有识别结果就提交，没有就静默复位
        const text = (finalTranscriptRef.current || '').trim();
        finalTranscriptRef.current = '';
        setInputText('');
        if (text) {
          submitVoiceTextRef.current(text);
        }
      };

      rec.onerror = (event: any) => {
        const errCode = event?.error || 'unknown';
        setIsRecording(false);
        recordingRef.current = false;

        if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
          toast.error('麦克风权限被拒绝了，去设置里打开一下吧 🎤');
        } else if (errCode === 'no-speech') {
          // 没说话不弹错误，静默结束
          finalTranscriptRef.current = '';
          setInputText('');
        } else if (errCode === 'network') {
          toast.error('语音识别需要网络，检查一下连接哦');
        } else if (errCode === 'audio-capture') {
          toast.error('没检测到麦克风设备，检查一下硬件');
        } else if (errCode !== 'aborted') {
          // aborted 是主动 stop 导致的，不提示
          toast.error('语音识别出了点小问题，再试一下？');
        }
      };

      recognitionRef.current = rec;
    }
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const streamRoastReply = useCallback(
    async (txSummary: string, msgId: string) => {
      startStreaming(msgId);
      try {
        let full = '';
        await streamRoast(txSummary, (piece) => {
          full += piece;
          updateMessageContent(msgId, full);
        });
        // 最终再确保一次持久化
        if (full) {
          updateMessageContent(msgId, full);
        }
      } catch (err: any) {
        logger.error('streamRoastReply error:', String(err));
        const isRateLimit = /额度已用尽|RateLimit|quota/i.test(String(err?.message ?? err));
        updateMessageContent(
          msgId,
          isRateLimit
            ? '今天的 AI 额度用完了，明天自动恢复～已经记的账都还在的！📋'
            : '呃……我今天脑壳有点卡，先记上了。😵',
        );
      } finally {
        endStreaming(msgId);
      }
    },
    [updateMessageContent]
  );

  const handleTextAccounting = useCallback(
    async (text: string) => {
      const userMsg = {
        id: genId('msg'),
        role: 'user' as const,
        type: 'text' as const,
        content: text,
        timestamp: Date.now(),
      };
      await addMessage(userMsg);
      setIsSending(true);

      try {
        // 携带多轮追问上下文（历史对话 + 已提取字段）与浏览器实时时间
        const parseResult = await parseText(text, {
          contextHistory: pendingContext?.history
            .map((h) => `${h.role === 'user' ? '用户' : 'Rolly'}：${h.content}`)
            .join('\n'),
          partialFields: pendingContext?.partialFields,
        });

        const parsed = parseResult?.transactions || [];
        const missingFields = parseResult?.missingFields || [];

        // 追问分支（无交易可建）：必填字段缺失、或模型未产出可建交易时，
        // 一律不建卡、AI 委婉追问、暂存上下文（最多 3 轮），保证"缺信息不建卡"契约
        if (parsed.length === 0) {
          const rounds = (pendingContext?.rounds ?? 0) + 1;
          if (rounds >= 3) {
            // 追问上限：转为手动提示
            const tipMsg = {
              id: genId('msg'),
              role: 'ai' as const,
              type: 'text' as const,
              content:
                '诶呀，几轮都没凑齐关键信息～先手动记一下吧，或者直接告诉我「金额 + 分类 + 日期」三件套 📝',
              timestamp: Date.now(),
            };
            await addMessage(tipMsg);
            setPendingContext(null);
            return;
          }
          const followMsg = {
            id: genId('msg'),
            role: 'ai' as const,
            type: 'text' as const,
            content:
              (missingFields.length > 0
                ? parseResult.followupQuestion
                : '') ||
              '再补充一下金额、分类或日期呗～不然我记不上呀 🤔',
            timestamp: Date.now(),
          };
          await addMessage(followMsg);
          // 暂存上下文，等待用户补齐
          setPendingContext({
            partialFields: {
              ...(pendingContext?.partialFields || {}),
              ...(parseResult.extracted || {}),
            },
            rounds,
            history: [
              ...(pendingContext?.history || []),
              { role: 'user', content: text },
              { role: 'ai', content: followMsg.content },
            ].slice(-6),
          });
          return;
        }

        // 建卡分支：有交易产出 → 创建账单卡片（交易落库）+ 流式吐槽
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        const newTxsData = parsed.map((p: any) => {
          const catInfo = categoryFromLabel(p.category || '其他');
          return {
            type: 'expense' as const,
            amount: Number(p.amount) || 0,
            category: catInfo.key,
            categoryEmoji: catInfo.emoji,
            note: p.note || p.remark || p.merchant || catInfo.label,
            // 日期/时间以 AI 解析为准（提示词已注入今天日期），兜底用本地当前时间
            date: p.date || todayStr,
            time: p.time || timeStr,
            merchant: p.merchant || undefined,
            source: 'text' as const,
          };
        });

        const newTxIds = await addTransactions(newTxsData);

        const cardMsg = {
          id: genId('msg'),
          role: 'ai',
          type: 'transaction-card',
          content: '',
          transactionIds: newTxIds,
          timestamp: Date.now(),
        };
        await addMessage(cardMsg);

        const summary = newTxIds.length > 0
          ? parsed
              .map((p: any) => {
                const catInfo = categoryFromLabel(p.category || '其他');
                const name = p.note || p.remark || p.merchant || catInfo.label;
                return `${catInfo.label} ${name} ${Number(p.amount || 0).toFixed(2)}元`;
              })
              .join('、')
          : '';
        const roastMsgId = genId('msg');
        const roastMsg = {
          id: roastMsgId,
          role: 'ai',
          type: 'text',
          content: '',
          timestamp: Date.now(),
        };
        await addMessage(roastMsg);
        streamRoastReply(summary, roastMsgId);
        // 建卡成功，清空追问上下文
        setPendingContext(null);
      } catch (err: any) {
        logger.error('handleTextAccounting error:', String(err));
        const isRateLimit = /额度已用尽|RateLimit|quota/i.test(String(err?.message ?? err));
        const failContent = isRateLimit
          ? '今天的 AI 额度用完了，明天自动恢复哦～可以先试试手动记？✍️'
          : '哎呀，我暂时没听清，再说一遍？🤔';
        const failMsg = {
          id: genId('msg'),
          role: 'ai',
          type: 'text',
          content: failContent,
          timestamp: Date.now(),
        };
        await addMessage(failMsg);
      } finally {
        setIsSending(false);
        setInputText('');
      }
    },
    [addMessage, streamRoastReply, pendingContext]
  );

  // ---------- 账单修改（审核机制） ----------

  /** 修改模式下提交：AI 解析修改指令 → 生成审核预览卡片（不直接落库） */
  const handleModify = useCallback(
    async (text: string) => {
      const target = transactions.find((t) => t.id === editingTxId);
      if (!target) {
        setEditingTxId(null);
        toast.info('这笔账单找不到了，先重新记一笔吧');
        return;
      }
      const userMsg = {
        id: genId('msg'),
        role: 'user' as const,
        type: 'text' as const,
        content: text,
        timestamp: Date.now(),
      };
      await addMessage(userMsg);
      setIsSending(true);

      try {
        // 最近 5 笔（含目标交易）供 AI 定位
        const recent = [...transactions]
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 5)
          .map((t) => ({
            note: t.note || '',
            category: t.category,
            amount: t.amount,
            date: t.date,
            time: t.time || '',
            merchant: t.merchant || '',
          }));
        const result = await parseModify(text, recent);

        const recentTxs = [...transactions]
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 5);

        if (
          result.found &&
          result.targetIndex >= 0 &&
          result.targetIndex < recentTxs.length &&
          Object.keys(result.changes || {}).length > 0
        ) {
          const targetTx = recentTxs[result.targetIndex];
          // 生成审核预览消息（含确认/取消），不直接修改交易
          const previewMsg = {
            id: genId('msg'),
            role: 'ai' as const,
            type: 'modify-preview' as const,
            content: JSON.stringify({
              txId: targetTx.id,
              changes: result.changes,
              confirmText: result.confirmText,
              status: 'pending',
            }),
            timestamp: Date.now(),
          };
          await addMessage(previewMsg);
          // 预览卡片自带确认按钮，退出输入框修改模式
          setEditingTxId(null);
          return;
        }

        // 未定位到/无有效变更 → AI 追问（保持修改模式让用户补充）
        const askMsg = {
          id: genId('msg'),
          role: 'ai' as const,
          type: 'text' as const,
          content:
            result.confirmText ||
            '没太明白要改啥，再说清楚点？比如「金额是28」「名称改成拿铁」🤔',
          timestamp: Date.now(),
        };
        await addMessage(askMsg);
      } catch (err: any) {
        logger.error('handleModify error:', String(err));
        const failMsg = {
          id: genId('msg'),
          role: 'ai' as const,
          type: 'text' as const,
          content: '哎呀，修改请求我没处理过来，再说一遍？🤔',
          timestamp: Date.now(),
        };
        await addMessage(failMsg);
      } finally {
        setIsSending(false);
        setInputText('');
      }
    },
    [transactions, editingTxId, addMessage, logger]
  );

  /** 审核确认：应用修改 + 落库 + 更新预览消息 + 吐槽 */
  const handleModifyConfirm = useCallback(
    async (msgId: string, txId: string, changes: Record<string, unknown>) => {
      try {
        const oldTx = transactions.find((t) => t.id === txId);
        await updateTransaction(txId, changes);
        const newTx = transactions.find((t) => t.id === txId);
        const labelOf = (k: string, v: unknown) => {
          if (k === 'amount') return `¥${Number(v).toFixed(2)}`;
          if (k === 'category') return categoryFromLabel(String(v)).label;
          return String(v);
        };
        const parts = Object.entries(changes).map(([k, v]) => {
          const oldV = oldTx ? (oldTx as any)[k] : undefined;
          const oldStr =
            k === 'category'
              ? categoryFromLabel(String(oldV || '其他')).label
              : k === 'amount'
                ? `¥${Number(oldV).toFixed(2)}`
                : String(oldV ?? '无');
          return `${k === 'amount' ? '金额' : k === 'note' ? '名称' : k === 'category' ? '分类' : k === 'date' ? '日期' : k === 'time' ? '时间' : '商家'} ${oldStr} → ${labelOf(k, v)}`;
        });
        updateMessageContent(
          msgId,
          JSON.stringify({
            status: 'confirmed',
            text: `✅ 已修改：${parts.join('，')}`,
          })
        );
        // 修改后的吐槽
        const roastMsgId = genId('msg');
        const roastMsg = {
          id: roastMsgId,
          role: 'ai' as const,
          type: 'text' as const,
          content: '',
          timestamp: Date.now(),
        };
        await addMessage(roastMsg);
        const newAmount = changes.amount ?? newTx?.amount ?? 0;
        streamRoastReply(
          `用户修正了一笔账单：${changes.note || newTx?.note || '消费'} 金额 ${Number(newAmount).toFixed(2)}元`,
          roastMsgId
        );
        toast.success('账单已更新 ✏️');
      } catch (err: any) {
        logger.error('handleModifyConfirm error:', String(err));
        toast.error('修改失败，再试一下？');
      }
    },
    [transactions, updateTransaction, addMessage, streamRoastReply, logger]
  );

  /** 审核取消：保持原样 */
  const handleModifyCancel = useCallback(
    (msgId: string) => {
      updateMessageContent(
        msgId,
        JSON.stringify({ status: 'cancelled', text: '已取消修改～这笔保持原样 😊' })
      );
    },
    [updateMessageContent]
  );

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || isSending) return;
    if (editingTxId) {
      handleModify(text);
    } else {
      handleTextAccounting(text);
    }
  }, [inputText, isSending, editingTxId, handleTextAccounting, handleModify]);

  const requestMicPermission = useCallback(async (): Promise<boolean> => {
    // 优先用 navigator.mediaDevices 主动申请权限（更可靠）
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // 申请成功后关掉轨道，避免占着麦克风
        stream.getTracks().forEach((t) => t.stop());
        return true;
      } catch (err: any) {
        const name = err?.name || '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          toast.error('麦克风权限被拒绝了，去浏览器设置里打开一下吧 🎤');
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          toast.error('没检测到麦克风设备哦');
        } else {
          toast.error('麦克风用不了，换个浏览器试试？');
        }
        return false;
      }
    }
    // 老浏览器没有 getUserMedia，让 SpeechRecognition 自己弹权限
    return true;
  }, []);

  const handleMicClick = useCallback(async () => {
    if (isSending || stoppingRef.current) return;
    if (!speechSupported) {
      toast.info('当前浏览器不支持语音输入哦，试试 Chrome 或 Safari～');
      return;
    }

    // 录音中 → 点击结束录音，识别结果在 onend 里统一提交
    if (recordingRef.current) {
      stoppingRef.current = true;
      try {
        recognitionRef.current?.stop();
      } catch {
        stoppingRef.current = false;
      }
      return;
    }

    // 首次使用先申请麦克风权限（在改 UI 状态之前完成，避免界面先变再回弹）
    if (!permissionCheckedRef.current) {
      const ok = await requestMicPermission();
      permissionCheckedRef.current = true;
      if (!ok) return;
    }
    if (recordingRef.current || stoppingRef.current) return;

    finalTranscriptRef.current = '';
    recordingRef.current = true;
    setInputText('');
    setIsRecording(true);

    try {
      recognitionRef.current?.start();
    } catch (err: any) {
      recordingRef.current = false;
      setIsRecording(false);
      const msg = String(err?.message || err || '');
      if (!msg.includes('already started')) {
        logger.warn('voice start error:', msg);
      }
    }
  }, [speechSupported, isSending, requestMicPermission]);

  // 让识别引擎的 onend 回调总能拿到最新的记账入口
  useEffect(() => {
    submitVoiceTextRef.current = handleTextAccounting;
  }, [handleTextAccounting]);

  const handleFilePick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || isSending) return;
      e.target.value = '';

      const reader = new FileReader();
      reader.onload = async () => {
        const imgMsg = {
          id: genId('msg'),
          role: 'user',
          type: 'image',
          content: '',
          imageUrl: reader.result as string,
          timestamp: Date.now(),
        };
        await addMessage(imgMsg);
      };
      reader.readAsDataURL(file);

      setIsSending(true);

      (async () => {
        try {
          const result = await ocrReceipt(reader.result as string);

          const totalAmount = parseFloat(result.total_amount || '0');

          if (!result.merchant_name && totalAmount === 0) {
            const failMsg = {
              id: genId('msg'),
              role: 'ai',
              type: 'text',
              content: '这张糊得我都看不清字了，重拍一张？手别抖！📸',
              timestamp: Date.now(),
            };
            await addMessage(failMsg);
            return;
          }

          const now = new Date();
          const dateStr =
            result.transaction_date ||
            `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
          const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

          const catInfo = categoryFromLabel('餐饮');
          const newTxId = await addTransaction({
            type: 'expense',
            amount: totalAmount,
            category: catInfo.key,
            categoryEmoji: catInfo.emoji,
            note: result.merchant_name || '小票消费',
            date: dateStr,
            time: timeStr,
            merchant: result.merchant_name || undefined,
            source: 'receipt',
          });

          const cardMsg = {
            id: genId('msg'),
            role: 'ai',
            type: 'transaction-card',
            content: '',
            transactionIds: [newTxId],
            timestamp: Date.now(),
          };
          await addMessage(cardMsg);

          const roastMsgId = genId('msg');
          const roastMsg = {
            id: roastMsgId,
            role: 'ai',
            type: 'text',
            content: '',
            timestamp: Date.now(),
          };
          await addMessage(roastMsg);
          streamRoastReply(
            `${result.merchant_name || '小票消费'} ¥${totalAmount.toFixed(2)}`,
            roastMsgId
          );
        } catch (err: any) {
          logger.error('handleFilePick error:', String(err));
          const isRateLimit = /额度已用尽|RateLimit|quota/i.test(String(err?.message ?? err));
          const failContent = isRateLimit
            ? '今天的 AI 额度用完了，明天自动恢复哦～小票可以先拍照存着！📸'
            : '这张糊得我都看不清字了，重拍一张？手别抖！📸';
          const failMsg = {
            id: genId('msg'),
            role: 'ai',
            type: 'text',
            content: failContent,
            timestamp: Date.now(),
          };
          await addMessage(failMsg);
        } finally {
          setIsSending(false);
        }
      })();
    },
    [addMessage, isSending, streamRoastReply]
  );

  const handleDelete = useCallback((txId: string) => {
    setDeleteTarget(txId);
  }, []);

  /** 进入修改模式（点卡片 ✏️） */
  const handleEditClick = useCallback((txId: string) => {
    setEditingTxId(txId);
    setInputText('');
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await removeTransaction(deleteTarget);
      setDeleteTarget(null);
      toast.success('已删除这笔记录');
    } catch {
      toast.error('删除失败了，再试一下？');
    }
  }, [deleteTarget, removeTransaction]);

  const getTxById = useCallback(
    (id: string) => transactions.find((t) => t.id === id),
    [transactions]
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#FFF9F3]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#E89AAD]" />
          <p className="text-sm text-[#A8988A]">正在加载 Rolly...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col bg-[#FFF9F3]">
      {/* 顶部栏 */}
      <header className="flex items-center gap-3 border-b border-[#F0E6DD] bg-white/70 px-4 py-3 backdrop-blur-md">
        <div className="h-10 w-10 overflow-hidden rounded-full ring-2 ring-[#FFE8DE]">
          <Image src={ROLLY_AVATAR} alt="Rolly" className="h-full w-full object-cover" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-[#5C4A3D]">Rolly</div>
          <div className="text-xs text-[#A8988A]">你的毒舌记账闺蜜 💕</div>
        </div>
      </header>

      {/* 今日概览 */}
      <div className="border-b border-[#F0E6DD] bg-gradient-to-br from-[#FFD6DF] via-[#FFE8DE] to-[#FFF0E5] px-4 py-3">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-[#8B7B6D]">今日支出</p>
            <p className="mt-0.5 text-2xl font-black text-[#D45A7A] tabular-nums tracking-tight">
              ¥{todayStats.expense.toFixed(2)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[#8B7B6D]">
              {todayStats.count} 笔交易
            </p>
            {todayStats.income > 0 && (
              <p className="mt-0.5 text-xs font-medium text-[#6FA87A]">
                收入 +¥{todayStats.income.toFixed(2)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 聊天流 */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'ai' && (
                <div className="mr-2 h-8 w-8 shrink-0 self-end overflow-hidden rounded-full">
                  <Image
                    src={ROLLY_AVATAR}
                    alt="Rolly"
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
              <div
                className={`max-w-[75%] ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                } flex flex-col gap-1.5`}
              >
                {msg.type === 'text' && (
                  <div
                    className={`whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                      msg.role === 'user'
                        ? 'rounded-br-md bg-[#E89AAD] text-white'
                        : 'rounded-bl-md bg-white text-[#5C4A3D] ring-1 ring-[#F0E6DD]'
                    }`}
                  >
                    {msg.content || (
                      streamingIds.has(msg.id) ? (
                        <span className="inline-flex items-center gap-1">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          正在输入...
                        </span>
                      ) : (
                        <span className="text-[#C9B8A8]">
                          这条回复生成时走丢了，忽略它吧～（可左滑删除）
                        </span>
                      )
                    )}
                  </div>
                )}

                {msg.type === 'image' && msg.imageUrl && (
                  <div className="max-w-[200px] overflow-hidden rounded-2xl shadow-sm ring-1 ring-[#F0E6DD]">
                    <Image
                      src={msg.imageUrl}
                      alt="小票"
                      className="block w-full"
                    />
                  </div>
                )}

                {msg.type === 'transaction-card' &&
                  msg.transactionIds && (
                    <div className="space-y-2">
                      {msg.transactionIds.map((txId) => {
                        const tx = getTxById(txId);
                        if (!tx) return null;
                        return (
                          <TransactionCard
                            key={txId}
                            transaction={tx}
                            onDelete={handleDelete}
                            onEdit={handleEditClick}
                            compact
                          />
                        );
                      })}
                    </div>
                  )}

                {msg.type === 'modify-preview' &&
                  (() => {
                    let data: any = null;
                    try {
                      data = JSON.parse(msg.content);
                    } catch {
                      /* 非 JSON 的旧消息 */
                    }
                    if (!data || typeof data !== 'object') return null;
                    // 已确认/已取消 → 文本展示
                    if (
                      data.status === 'confirmed' ||
                      data.status === 'cancelled'
                    ) {
                      return (
                        <div className="rounded-2xl rounded-bl-md bg-white px-4 py-2.5 text-sm text-[#5C4A3D] shadow-sm ring-1 ring-[#F0E6DD]">
                          {data.text}
                        </div>
                      );
                    }
                    // pending → 审核预览卡片（旧→新 + 确认/取消）
                    const tx = data.txId ? getTxById(data.txId) : null;
                    if (!tx) return null;
                    const changes: Record<string, unknown> =
                      data.changes || {};
                    const fmtVal = (k: string, v: unknown) => {
                      if (k === 'amount') return `¥${Number(v).toFixed(2)}`;
                      if (k === 'category')
                        return categoryFromLabel(String(v)).label;
                      return String(v ?? '—');
                    };
                    const labelOf = (k: string) =>
                      k === 'amount'
                        ? '金额'
                        : k === 'note'
                          ? '名称'
                          : k === 'category'
                            ? '分类'
                            : k === 'date'
                              ? '日期'
                              : k === 'time'
                                ? '时间'
                                : '商家';
                    return (
                      <div className="w-[260px] space-y-2 rounded-2xl rounded-bl-md bg-white p-3 shadow-sm ring-1 ring-[#F0E6DD]">
                        <p className="text-sm font-medium text-[#5C4A3D]">
                          {data.confirmText}
                        </p>
                        <TransactionCard transaction={tx} compact />
                        <div className="space-y-1 rounded-xl bg-[#FFF9F3] p-2">
                          {Object.entries(changes).map(([k, v]) => (
                            <div
                              key={k}
                              className="flex items-center justify-between text-xs text-[#A8988A]"
                            >
                              <span>{labelOf(k)}</span>
                              <span>
                                <span className="line-through">
                                  {fmtVal(k, (tx as any)[k])}
                                </span>
                                <span className="mx-1 text-[#6FA87A]">→</span>
                                <span className="font-semibold text-[#5C4A3D]">
                                  {fmtVal(k, v)}
                                </span>
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2 pt-0.5">
                          <button
                            type="button"
                            onClick={() =>
                              handleModifyConfirm(msg.id, data.txId, changes)
                            }
                            className="flex-1 rounded-full bg-[#E89AAD] py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#D97D95]"
                          >
                            ✅ 确认修改
                          </button>
                          <button
                            type="button"
                            onClick={() => handleModifyCancel(msg.id)}
                            className="flex-1 rounded-full bg-[#F5EDE5] py-1.5 text-xs font-medium text-[#8B7B6D] transition-colors hover:bg-[#EDE0D4]"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    );
                  })()}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {isSending && (
          <div className="flex justify-start">
            <div className="mr-2 h-8 w-8 shrink-0 rounded-full overflow-hidden">
              <Image
                src={ROLLY_AVATAR}
                alt="Rolly"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-sm ring-1 ring-[#F0E6DD]">
              <span className="h-2 w-2 animate-bounce rounded-full bg-[#E89AAD] [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-[#E89AAD] [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-[#E89AAD]" />
            </div>
          </div>
        )}
      </div>

      {/* 底部固定输入栏 */}
      <div className="shrink-0 border-t border-[#F0E6DD] bg-white px-2.5 py-2.5 pb-[calc(env(safe-area-inset-bottom)+10px)]">
        {/* 修改模式提示条 */}
        {editingTxId &&
          (() => {
            const et = transactions.find((t) => t.id === editingTxId);
            return (
              <div className="mb-2 flex items-center justify-between rounded-full bg-[#EDF6EF] px-3.5 py-1.5 text-xs text-[#4E8A5C]">
                <span>
                  ✏️ 正在修改：{et?.note || '这笔'}（
                  ¥{Number(et?.amount || 0).toFixed(2)}）
                </span>
                <button
                  type="button"
                  onClick={() => setEditingTxId(null)}
                  className="shrink-0 font-medium text-[#6FA87A] hover:underline"
                >
                  退出
                </button>
              </div>
            );
          })()}
        <div className="flex items-center gap-2">
          {/* 左侧语音按钮 */}
          <button
            type="button"
            onClick={handleMicClick}
            disabled={isSending}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all active:scale-95 disabled:opacity-50 ${
              isRecording
                ? 'bg-[#E89AAD] text-white'
                : 'bg-[#F5EDE5] text-[#8B7B6D] hover:bg-[#EDE0D4]'
            }`}
            aria-label={isRecording ? '结束录音' : '语音输入'}
            title={
              speechSupported
                ? isRecording
                  ? '点击结束录音'
                  : '点击开始说话'
                : '当前浏览器不支持语音'
            }
          >
            {isRecording ? (
              <AudioLines className="h-5 w-5 animate-pulse" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
          </button>

          {/* 中间输入框 */}
          <div className="relative flex-1">
            <Input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={
                isRecording
                  ? '正在听你说...'
                  : editingTxId
                    ? '怎么改这笔？如：金额28 / 名称拿铁 / 分类交通'
                    : '说一下你花了啥～'
              }
              className={`h-10 rounded-full border-[#F0E6DD] bg-[#FFF9F3] px-4 text-sm placeholder:text-[#C9B8A8] focus-visible:ring-[#E89AAD] ${
                isRecording ? 'animate-pulse border-[#E89AAD]' : ''
              }`}
            />
          </div>

          {/* 右侧：有文字 → 发送；无文字 → 相机 */}
          {inputText.trim() ? (
            <button
              type="button"
              onClick={handleSend}
              disabled={isSending}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E89AAD] text-white transition-all active:scale-95 disabled:opacity-50"
              aria-label="发送"
            >
              <Send className="h-5 w-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSending}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F5EDE5] text-[#8B7B6D] transition-all hover:bg-[#EDE0D4] active:scale-95 disabled:opacity-50"
              aria-label="拍照识别小票"
            >
              <Camera className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* 录音中提示条 */}
        {isRecording && (
          <div className="mt-2 flex items-center justify-center gap-2 rounded-full bg-[#FFE8DE] py-1.5 text-xs font-medium text-[#D45A7A]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#E89AAD]" />
            正在录音... 再点一下麦克风结束
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFilePick}
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
