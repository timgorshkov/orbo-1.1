import * as React from 'react'
import clsx from 'clsx'

export function Button({ 
  className, 
  variant='default', 
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'ghost' | 'outline'
}) {
  const base = "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition"
  const styles = {
    default: "bg-black text-white hover:bg-black/85",
    ghost: "bg-transparent hover:bg-black/5",
    outline: "border border-black/10 hover:bg-black/5"
  }
  
  return (
    <button 
      className={clsx(base, styles[variant], className)} 
      {...props} 
    />
  )
}
