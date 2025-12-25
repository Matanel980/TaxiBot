'use client'

import { useState, useEffect, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Search, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import type { Profile, Trip } from '@/lib/supabase'

interface SearchResult {
  type: 'driver' | 'trip' | 'location'
  id: string
  title: string
  subtitle: string
  href: string
}

export function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults([])
      setShowResults(false)
      return
    }

    const search = async () => {
      setLoading(true)
      const searchTerm = query.toLowerCase()

      try {
        // Search drivers
        const { data: drivers } = await supabase
          .from('profiles')
          .select('id, full_name, phone, role')
          .eq('role', 'driver')
          .or(`full_name.ilike.%${query}%,phone.ilike.%${query}%`)
          .limit(5)

        // Search trips
        const { data: trips } = await supabase
          .from('trips')
          .select('id, customer_phone, pickup_address, destination_address')
          .or(`customer_phone.ilike.%${query}%,pickup_address.ilike.%${query}%,destination_address.ilike.%${query}%`)
          .limit(5)

        const searchResults: SearchResult[] = []

        // Add driver results
        drivers?.forEach((driver) => {
          searchResults.push({
            type: 'driver',
            id: driver.id,
            title: driver.full_name,
            subtitle: driver.phone,
            href: `/admin/drivers`,
          })
        })

        // Add trip results
        trips?.forEach((trip) => {
          searchResults.push({
            type: 'trip',
            id: trip.id,
            title: `${trip.pickup_address} → ${trip.destination_address}`,
            subtitle: trip.customer_phone,
            href: `/admin/history`,
          })
        })

        // Add location results (from trip addresses)
        const uniqueLocations = new Set<string>()
        trips?.forEach((trip) => {
          if (trip.pickup_address.toLowerCase().includes(searchTerm)) {
            uniqueLocations.add(trip.pickup_address)
          }
          if (trip.destination_address.toLowerCase().includes(searchTerm)) {
            uniqueLocations.add(trip.destination_address)
          }
        })

        uniqueLocations.forEach((location) => {
          searchResults.push({
            type: 'location',
            id: location,
            title: location,
            subtitle: 'מיקום',
            href: `/admin/history?search=${encodeURIComponent(location)}`,
          })
        })

        setResults(searchResults.slice(0, 10)) // Limit to 10 results
        setShowResults(true)
      } catch (error) {
        console.error('Search error:', error)
      } finally {
        setLoading(false)
      }
    }

    const debounceTimer = setTimeout(search, 300)
    return () => clearTimeout(debounceTimer)
  }, [query, supabase])

  const handleResultClick = (href: string) => {
    router.push(href)
    setQuery('')
    setShowResults(false)
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.global-search-container')) {
        setShowResults(false)
      }
    }

    if (showResults) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showResults])

  return (
    <div className="relative max-w-md w-full global-search-container">
      <div className="relative">
        <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
        <Input
          type="search"
          placeholder="חיפוש נהגים, נסיעות, מיקומים..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.length >= 2 && setShowResults(true)}
          className="pr-10 pl-10 w-full"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('')
              setShowResults(false)
            }}
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {showResults && results.length > 0 && (
        <div className="absolute top-full mt-2 w-full bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 overflow-y-auto">
          {results.map((result, index) => (
            <button
              key={`${result.type}-${result.id}-${index}`}
              onClick={() => handleResultClick(result.href)}
              className="w-full text-right p-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{result.title}</p>
                  <p className="text-sm text-gray-500">{result.subtitle}</p>
                </div>
                <span className="text-xs text-gray-400 ml-2">
                  {result.type === 'driver' ? 'נהג' : result.type === 'trip' ? 'נסיעה' : 'מיקום'}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {showResults && query.length >= 2 && results.length === 0 && !loading && (
        <div className="absolute top-full mt-2 w-full bg-white rounded-lg shadow-lg border border-gray-200 z-50 p-4 text-center text-gray-500">
          לא נמצאו תוצאות
        </div>
      )}
    </div>
  )
}

