'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MapPin } from 'lucide-react'
import type { Profile, ZonePostGIS } from '@/lib/supabase'
import { motion } from 'framer-motion'

interface ZoneManagementProps {
  zones: ZonePostGIS[]
  drivers: Profile[]
}

export function ZoneManagement({ zones, drivers }: ZoneManagementProps) {
  const getDriverCount = (zoneId: string) => {
    return drivers.filter(
      d => d.current_zone === zoneId && d.is_online && d.role === 'driver'
    ).length
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {zones.length === 0 ? (
        <Card className="glass-card rounded-2xl">
          <CardContent className="p-6 text-center text-gray-500">
            אין אזורים מוגדרים
          </CardContent>
        </Card>
      ) : (
        zones.map((zone, index) => (
          <motion.div
            key={zone.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="glass-card rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="text-deep-blue" size={20} />
                  {zone.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">נהגים פעילים</span>
                    <Badge variant="default">
                      {getDriverCount(zone.id)}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))
      )}
    </div>
  )
}


