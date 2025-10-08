import * as React from 'react';
import clsx from 'clsx';

export function CommandDialog({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4" onClick={() => onOpenChange(false)}>
      <div className="w-full max-w-lg rounded-xl border border-neutral-200 bg-white shadow-xl" onClick={event => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function CommandInput({ value, onValueChange, placeholder }: { value: string; onValueChange: (value: string) => void; placeholder?: string }) {
  return (
    <input
      className="w-full border-b border-neutral-200 px-4 py-3 text-sm outline-none"
      placeholder={placeholder}
      value={value}
      onChange={event => onValueChange(event.target.value)}
      autoFocus
    />
  );
}

export function CommandList({ children }: { children: React.ReactNode }) {
  return <div className="max-h-80 overflow-y-auto px-2 py-2 text-sm">{children}</div>;
}

export function CommandGroup({ heading, children }: { heading?: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      {heading && <div className="px-2 pb-1 text-xs font-medium uppercase text-neutral-400">{heading}</div>}
      <div className="space-y-1">{children}</div>
    </div>
  );
}

export function CommandItem({ value, onSelect, children }: { value: string; onSelect: (value: string) => void; children: React.ReactNode }) {
  return (
    <button
      className="w-full rounded-md px-3 py-2 text-left hover:bg-neutral-100"
      onClick={() => onSelect(value)}
    >
      {children}
    </button>
  );
}

export function CommandEmpty({ children }: { children: React.ReactNode }) {
  return <div className="px-3 py-6 text-center text-sm text-neutral-400">{children}</div>;
}
