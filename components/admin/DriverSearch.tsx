'use client'

import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'

interface DriverSearchProps {
  value: string
  onChange: (value: string) => void
}

export function DriverSearch({ value, onChange }: DriverSearchProps) {
  return (
    <div className="relative mb-4">
      <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
      <Input
        type="search"
        placeholder="חיפוש לפי שם או טלפון..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pr-10"
      />
    </div>
  )
}

