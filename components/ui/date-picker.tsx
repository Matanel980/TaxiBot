'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface DatePickerProps {
  label?: string
  value: string
  onChange: (value: string) => void
  className?: string
}

export function DatePicker({ label, value, onChange, className }: DatePickerProps) {
  return (
    <div className={className}>
      {label && <Label>{label}</Label>}
      <Input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1"
      />
    </div>
  )
}

