import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

const Dialog: React.FC<DialogProps> = ({ open, title, onClose, children }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white" title="Fechar">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export default Dialog;
