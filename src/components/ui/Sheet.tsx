import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function Sheet({ open, onClose, title, children }: SheetProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/60 animate-fade-in"
        onClick={onClose}
      />
      <div className="relative bg-[#2D5A3D] border-t border-[#4A7A5A] rounded-t-3xl max-h-[85vh] overflow-y-auto animate-sheet-up safe-bottom">
        <div className="sticky top-0 bg-[#2D5A3D] pt-3 pb-2 px-5 border-b border-[#4A7A5A]/60 z-10">
          <div className="w-10 h-1 bg-[#4A7A5A] rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            {title ? (
              <h3 className="font-mono text-sm text-[#F5EDD0] tracking-wide">{title}</h3>
            ) : (
              <span />
            )}
            <button
              onClick={onClose}
              className="text-[#A8C5B0] hover:text-white btn-press p-1"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
