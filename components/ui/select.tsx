'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import clsx from 'clsx'

interface SelectProps {
  value: string
  onValueChange: (value: string) => void
  children: React.ReactNode
  required?: boolean
}

export function Select({ value, onValueChange, children, required }: SelectProps) {
  const [open, setOpen] = React.useState(false)
  const selectRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  // Find selected value from SelectContent -> SelectItem children
  let selectedLabel = 'Выберите...'
  React.Children.forEach(children, (child: any) => {
    if (child?.type === SelectContent) {
      React.Children.forEach(child.props.children, (item: any) => {
        if (item?.props?.value === value) {
          selectedLabel = item.props.children
        }
      })
    }
  })

  return (
    <div ref={selectRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={clsx(
          'flex w-full items-center justify-between rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm',
          'focus:outline-none focus:ring-2 focus:ring-blue-500',
          required && !value && 'border-red-300'
        )}
      >
        <span className={clsx(!value && 'text-neutral-400')}>
          {selectedLabel}
        </span>
        <ChevronDown className={clsx('h-4 w-4 text-neutral-500 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-neutral-200 bg-white shadow-lg">
          <div className="max-h-60 overflow-auto">
            {React.Children.map(children, (child: any) => {
              if (child?.type === SelectContent) {
                return React.cloneElement(child, {
                  onSelect: (val: string) => {
                    onValueChange(val)
                    setOpen(false)
                  },
                  selectedValue: value
                })
              }
              return null
            })}
          </div>
        </div>
      )}
    </div>
  )
}

interface SelectContentProps {
  children: React.ReactNode
  onSelect?: (value: string) => void
  selectedValue?: string
}

export function SelectContent({ children, onSelect, selectedValue }: SelectContentProps) {
  return (
    <div className="p-1">
      {React.Children.map(children, (child: any) => {
        if (child?.type === SelectItem) {
          return React.cloneElement(child, {
            onSelect,
            isSelected: child.props.value === selectedValue
          })
        }
        return child
      })}
    </div>
  )
}

interface SelectTriggerProps {
  children: React.ReactNode
  className?: string
}

export function SelectTrigger({ children, className }: SelectTriggerProps) {
  return <div className={className}>{children}</div>
}

interface SelectValueProps {
  placeholder?: string
}

export function SelectValue({ placeholder }: SelectValueProps) {
  return <span>{placeholder}</span>
}

interface SelectItemProps {
  value: string
  children: React.ReactNode
  onSelect?: (value: string) => void
  isSelected?: boolean
}

export function SelectItem({ value, children, onSelect, isSelected }: SelectItemProps) {
  return (
    <div
      onClick={() => onSelect?.(value)}
      className={clsx(
        'cursor-pointer rounded-sm px-2 py-1.5 text-sm hover:bg-neutral-100',
        isSelected && 'bg-blue-50 text-blue-900'
      )}
    >
      {children}
    </div>
  )
}

