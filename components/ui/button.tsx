import * as React from 'react'
import clsx from 'clsx'

export function Button({ 
  className, 
  variant='default',
  size='md',
  asChild,
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'ghost' | 'outline' | 'secondary' | 'muted',
  size?: 'sm' | 'md' | 'lg' | 'icon',
  asChild?: boolean
}) {
  const base = "inline-flex items-center justify-center rounded-xl font-medium transition"
  
  const sizeStyles = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
    icon: "h-9 w-9 p-0"
  }
  
  const styles = {
    default: "bg-black text-white hover:bg-black/85",
    ghost: "bg-transparent hover:bg-black/5",
    outline: "border border-black/10 hover:bg-black/5",
    secondary: "bg-neutral-100 text-neutral-900 hover:bg-neutral-200",
    muted: "bg-transparent text-neutral-500 hover:text-neutral-800"
  }
  
  return (
    <button 
      className={clsx(base, sizeStyles[size], styles[variant], className)} 
      {...props} 
    />
  )
}
