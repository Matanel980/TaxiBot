'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import type { Profile } from '@/lib/supabase'
import { useMemo } from 'react'
import { Edit2, MapPin } from 'lucide-react'

interface DriverListProps {
  drivers: Profile[]
  searchQuery?: string
  onApproveToggle?: (driverId: string, isApproved: boolean) => void
  onEdit?: (driver: Profile) => void
  onTrack?: (driver: Profile) => void
}

export function DriverList({ drivers, searchQuery = '', onApproveToggle, onEdit, onTrack }: DriverListProps) {
  const driverProfiles = useMemo(() => {
    let filtered = drivers.filter(d => d.role === 'driver')
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(d => 
        d.full_name.toLowerCase().includes(query) ||
        d.phone.includes(query)
      )
    }
    
    return filtered
  }, [drivers, searchQuery])

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-gray-900">רשימת נהגים ({driverProfiles.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>שם</TableHead>
                <TableHead>טלפון</TableHead>
                <TableHead>מספר רכב</TableHead>
                <TableHead>אזור</TableHead>
                <TableHead>סטטוס</TableHead>
                <TableHead>מיקום בתור</TableHead>
                {onApproveToggle && <TableHead>אישור</TableHead>}
                {(onEdit || onTrack) && <TableHead>פעולות</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {driverProfiles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={onApproveToggle || onEdit || onTrack ? 8 : 6} className="text-center text-gray-500">
                    {searchQuery ? 'לא נמצאו נהגים התואמים לחיפוש' : 'אין נהגים'}
                  </TableCell>
                </TableRow>
              ) : (
                driverProfiles.map((driver) => (
                  <TableRow key={driver.id}>
                    <TableCell className="font-medium">{driver.full_name}</TableCell>
                    <TableCell>{driver.phone}</TableCell>
                    <TableCell>{driver.vehicle_number || '-'}</TableCell>
                    <TableCell>{driver.current_zone ? 'מרכז העיר' : '-'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={driver.is_online ? 'default' : 'secondary'}
                      >
                        {driver.is_online ? 'פעיל' : 'לא פעיל'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {driver.is_online && driver.current_zone ? '#' : '-'}
                    </TableCell>
                    {onApproveToggle && (
                      <TableCell>
                        <Switch
                          checked={(driver as any).is_approved !== false}
                          onCheckedChange={(checked) => onApproveToggle(driver.id, checked)}
                        />
                      </TableCell>
                    )}
                    {(onEdit || onTrack) && (
                      <TableCell>
                        <div className="flex gap-2">
                          {onEdit && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onEdit(driver)}
                              title="ערוך"
                            >
                              <Edit2 size={16} />
                            </Button>
                          )}
                          {onTrack && driver.latitude && driver.longitude && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onTrack(driver)}
                              title="מעקב חי"
                            >
                              <MapPin size={16} />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}


