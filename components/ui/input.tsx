import * as React from 'react'
import clsx from 'clsx'

export const Input = React.forwardRef<
  HTMLInputElement, 
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => {
  return (
    <input 
      ref={ref} 
      className={clsx(
        "w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10", 
        className
      )} 
      {...props} 
    />
  )
})

Input.displayName = 'Input'
