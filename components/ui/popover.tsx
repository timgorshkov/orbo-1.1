import * as React from 'react';

export function Popover({ children }: { children: React.ReactNode }) {
  return <div className="relative inline-block">{children}</div>;
}

export function PopoverTrigger({ asChild, children }: { asChild?: boolean; children: React.ReactElement }) {
  return React.cloneElement(children, {
    ...children.props
  });
}

export function PopoverContent({ children, className, side, align }: { children: React.ReactNode; className?: string; side?: string; align?: string }) {
  return (
    <div className={`absolute z-10 mt-1 min-w-[160px] rounded-lg border border-neutral-200 bg-white shadow-lg ${className ?? ''}`}>
      {children}
    </div>
  );
}
