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

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  description?: string;
}

export default function DeleteConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  description = '删除后无法恢复哦，确定要删掉这笔记录吗？',
}: DeleteConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[320px] rounded-2xl border-0 bg-white p-5 shadow-xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-center text-base font-semibold text-[#5C4A3D]">
            确认删除？
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center text-sm text-[#A8988A]">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-4 flex-row gap-2 sm:gap-2">
          <AlertDialogCancel className="flex-1 rounded-xl border-[#F0E6DD] text-sm text-[#8B7B6D] hover:bg-[#FFF9F3]">
            再想想
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-[#E89AAD] text-sm text-white hover:bg-[#D48092]"
          >
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
