'use client'

import { useMediaQuery } from '@/lib/hooks/useMediaQuery'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface ResponsiveTableProps<T> {
  headers: { key: string; label: string }[]
  data: T[]
  mobileCardRender: (row: T, index: number) => React.ReactNode
  desktopRowRender: (row: T, index: number) => React.ReactNode
  emptyMessage?: string
}

export function ResponsiveTable<T extends { id?: string }>({
  headers,
  data,
  mobileCardRender,
  desktopRowRender,
  emptyMessage = 'אין נתונים',
}: ResponsiveTableProps<T>) {
  const isMobile = useMediaQuery('(max-width: 768px)')

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        {emptyMessage}
      </div>
    )
  }

  if (isMobile) {
    // Mobile: Card view
    return (
      <div className="space-y-3">
        {data.map((row, index) => (
          <Card key={row.id || index} className="glass-card">
            <CardContent className="p-4">
              {mobileCardRender(row, index)}
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  // Desktop: Table view
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((header) => (
              <TableHead key={header.key} className="text-gray-700">
                {header.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, index) => (
            <TableRow key={row.id || index}>
              {desktopRowRender(row, index)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

