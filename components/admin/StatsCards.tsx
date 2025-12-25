'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, Clock, CheckCircle, AlertCircle, MapPin } from 'lucide-react'
import { motion } from 'framer-motion'

interface StatCard {
  title: string
  value: string | number
  icon: React.ElementType
  color: string
}

interface StatsCardsProps {
  stats: {
    activeDrivers: number
    pendingOrders: number
    completedToday: number
    avgWaitTime: string
    zonesCount: number
  }
}

export function StatsCards({ stats }: StatsCardsProps) {
  const cards: StatCard[] = [
    {
      title: 'נהגים פעילים',
      value: stats.activeDrivers,
      icon: Users,
      color: 'text-blue-600'
    },
    {
      title: 'אזורים',
      value: stats.zonesCount,
      icon: MapPin,
      color: 'text-amber-600'
    },
    {
      title: 'הזמנות ממתינות',
      value: stats.pendingOrders,
      icon: AlertCircle,
      color: 'text-orange-600'
    },
    {
      title: 'הושלמו היום',
      value: stats.completedToday,
      icon: CheckCircle,
      color: 'text-green-600'
    },
    {
      title: 'זמן המתנה ממוצע',
      value: stats.avgWaitTime,
      icon: Clock,
      color: 'text-purple-600'
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      {cards.map((card, index) => {
        const Icon = card.icon
        return (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="glass-card">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-700">
                  {card.title}
                </CardTitle>
                <Icon className={card.color} size={20} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">{card.value}</div>
              </CardContent>
            </Card>
          </motion.div>
        )
      })}
    </div>
  )
}


