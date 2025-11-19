'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import clsx from 'clsx'

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  if (!open) return null

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => onOpenChange(false)}
    >
      <div 
        className="bg-white rounded-xl shadow-xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

export function DialogContent({ 
  className, 
  children 
}: { 
  className?: string
  children: React.ReactNode 
}) {
  return (
    <div className={clsx('p-6', className)}>
      {children}
    </div>
  )
}

export function DialogHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4">
      {children}
    </div>
  )
}

export function DialogTitle({ 
  className, 
  children 
}: { 
  className?: string
  children: React.ReactNode 
}) {
  return (
    <h2 className={clsx('text-xl font-semibold', className)}>
      {children}
    </h2>
  )
}

export function DialogDescription({ 
  className, 
  children 
}: { 
  className?: string
  children: React.ReactNode 
}) {
  return (
    <p className={clsx('text-sm text-neutral-600 mt-1', className)}>
      {children}
    </p>
  )
}

