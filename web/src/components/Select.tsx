import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

interface Option {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
}

export function Select({ value, onChange, options, placeholder = 'Select...', className = '' }: SelectProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  const updatePos = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();

    const handleClick = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        panelRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);

    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [open, updatePos]);

  const selectedLabel = options.find(o => o.value === value)?.label ?? placeholder;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className={`inline-flex items-center justify-between gap-2 rounded-xl bg-white px-4 py-2 text-sm shadow-soft-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-200 ${className}`}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          className="fixed z-50 rounded-xl bg-white shadow-soft-md max-h-[280px] overflow-y-auto py-1"
          style={{ top: pos.top, left: pos.left, minWidth: pos.width }}
        >
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`flex w-full items-center gap-2 px-4 py-2 text-sm text-left ${
                opt.value === value ? 'text-slate-900 font-medium' : 'text-slate-700'
              } hover:bg-slate-50`}
            >
              <span className="w-4 shrink-0">
                {opt.value === value && <Check className="h-4 w-4 text-blue-600" />}
              </span>
              <span className="truncate">{opt.label}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
