'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import clsx from 'clsx'

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  onInteractOutside?: (e: Event) => void
}

export function Dialog({ open, onOpenChange, children, onInteractOutside }: DialogProps) {
  if (!open) return null

  const handleBackdropClick = (e: React.MouseEvent) => {
    // Only close if clicking directly on backdrop, not on content
    if (e.target === e.currentTarget) {
      if (onInteractOutside) {
        onInteractOutside(e.nativeEvent)
      } else {
        onOpenChange(false)
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onOpenChange(false)
    }
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
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

export function DialogFooter({ 
  className, 
  children 
}: { 
  className?: string
  children: React.ReactNode 
}) {
  return (
    <div className={clsx('flex justify-end gap-2 mt-6 pt-4 border-t', className)}>
      {children}
    </div>
  )
}

