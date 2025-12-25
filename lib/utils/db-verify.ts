'use client'

import { createClient } from '@/lib/supabase'

/**
 * Verify that required database tables exist
 * This helps diagnose the "relation does not exist" error
 */
export async function verifyDatabaseTables() {
  const supabase = createClient()
  const tables = ['profiles', 'trips', 'zones']
  const results: Record<string, { exists: boolean; error?: string }> = {}

  for (const table of tables) {
    try {
      const { error } = await supabase
        .from(table)
        .select('id')
        .limit(1)

      if (error) {
        if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
          results[table] = {
            exists: false,
            error: `Table '${table}' does not exist. Please run the database migrations from README.md`
          }
        } else {
          results[table] = {
            exists: true, // Table exists but might have permission issues
            error: error.message
          }
        }
      } else {
        results[table] = { exists: true }
      }
    } catch (err: any) {
      results[table] = {
        exists: false,
        error: err.message || 'Unknown error'
      }
    }
  }

  return results
}

