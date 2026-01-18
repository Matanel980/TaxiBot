'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

interface UseSupabaseQueryOptions<T> {
  query: (supabase: SupabaseClient) => Promise<{ data: T | null; error: any }>
  dependencies?: any[]
  onError?: (error: any) => void
}

export function useSupabaseQuery<T>({ query, dependencies = [], onError }: UseSupabaseQueryOptions<T>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<any>(null)
  const supabase = createClient()

  useEffect(() => {
    let isMounted = true

    const fetchData = async () => {
      try {
        setLoading(true)
        setError(null)

        const result = await query(supabase)

        if (!isMounted) return

        if (result.error) {
          // Check for common errors
          if (result.error.message?.includes('relation') && result.error.message?.includes('does not exist')) {
            const tableError = new Error(
              `Database table not found. Please ensure the table exists in your Supabase database. Error: ${result.error.message}`
            )
            setError(tableError)
            onError?.(tableError)
          } else {
            setError(result.error)
            onError?.(result.error)
          }
          setData(null)
        } else {
          setData(result.data)
        }
      } catch (err: any) {
        if (!isMounted) return
        setError(err)
        onError?.(err)
        setData(null)
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    fetchData()

    return () => {
      isMounted = false
    }
  }, [supabase, ...dependencies])

  return { data, loading, error }
}








