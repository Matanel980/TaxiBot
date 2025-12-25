'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { DatePicker } from '@/components/ui/date-picker'
import type { Trip } from '@/lib/supabase'
import { ChevronRight, ChevronLeft } from 'lucide-react'

export default function AdminHistoryPage() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const limit = 20

  const fetchTrips = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      })

      if (search) {
        params.append('search', search)
      }

      if (statusFilter !== 'all') {
        params.append('status', statusFilter)
      }

      if (startDate) {
        params.append('startDate', startDate)
      }

      if (endDate) {
        params.append('endDate', endDate)
      }

      const response = await fetch(`/api/trips/history?${params.toString()}`)
      const result = await response.json()

      if (result.error) {
        console.error('Error fetching trips:', result.error)
      } else {
        setTrips(result.trips || [])
        setTotalPages(result.pagination?.totalPages || 1)
        setTotal(result.pagination?.total || 0)
      }
    } catch (err) {
      console.error('Unexpected error fetching trips:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTrips()
  }, [page, search, statusFilter, startDate, endDate])

  return (
    <div className="space-y-4 sm:space-y-6">
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">היסטוריה</h1>
      
      {/* Filters */}
      <div className="glass-card rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Input
              type="search"
              placeholder="חיפוש לפי טלפון או כתובת..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1) // Reset to first page on search
              }}
              className="w-full"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setPage(1)
            }}
            className="px-4 py-2 border border-gray-300 rounded-md bg-white"
          >
            <option value="all">כל הסטטוסים</option>
            <option value="pending">ממתין</option>
            <option value="active">פעיל</option>
            <option value="completed">הושלם</option>
          </select>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4">
          <DatePicker
            label="מתאריך"
            value={startDate}
            onChange={(value) => {
              setStartDate(value)
              setPage(1)
            }}
            className="flex-1"
          />
          <DatePicker
            label="עד תאריך"
            value={endDate}
            onChange={(value) => {
              setEndDate(value)
              setPage(1)
            }}
            className="flex-1"
          />
        </div>
      </div>

      <Card className="glass-card rounded-2xl">
        <CardHeader>
          <CardTitle className="text-gray-900">
            נסיעות ({total} סה"כ)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-deep-blue mx-auto mb-4"></div>
              <p className="text-gray-500">טוען...</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-gray-700">תאריך</TableHead>
                      <TableHead className="text-gray-700">נקודת איסוף</TableHead>
                      <TableHead className="text-gray-700">יעד</TableHead>
                      <TableHead className="text-gray-700">סטטוס</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trips.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-gray-500">
                          אין נסיעות
                        </TableCell>
                      </TableRow>
                    ) : (
                      trips.map((trip) => (
                        <TableRow key={trip.id}>
                          <TableCell className="text-gray-900">
                            {new Date(trip.created_at).toLocaleDateString('he-IL', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </TableCell>
                          <TableCell className="text-gray-900">{trip.pickup_address}</TableCell>
                          <TableCell className="text-gray-900">{trip.destination_address}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                trip.status === 'completed' ? 'default' :
                                trip.status === 'active' ? 'secondary' : 'outline'
                              }
                            >
                              {trip.status === 'pending' ? 'ממתין' :
                               trip.status === 'active' ? 'פעיל' : 'הושלם'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                  <div className="text-sm text-gray-600">
                    עמוד {page} מתוך {totalPages}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      <ChevronRight size={16} className="ml-1" />
                      קודם
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      הבא
                      <ChevronLeft size={16} className="mr-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
