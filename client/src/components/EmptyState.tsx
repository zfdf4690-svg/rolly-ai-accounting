import { Image } from '@/components/ui/image';

interface EmptyStateProps {
  title: string;
  description?: string;
  imageUrl?: string;
}

const DEFAULT_EMPTY_IMG = '/rolly_empty.png';

export default function EmptyState({
  title,
  description,
  imageUrl = DEFAULT_EMPTY_IMG,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 h-36 w-36 overflow-hidden rounded-full">
        <Image
          src={imageUrl}
          alt="空状态"
          className="h-full w-full object-cover"
        />
      </div>
      <p className="text-base font-medium text-[#5C4A3D]">{title}</p>
      {description && (
        <p className="mt-1 text-sm text-[#A8988A]">{description}</p>
      )}
    </div>
  );
}
