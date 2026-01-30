'use client'

/**
 * Driver Dashboard Collapsible Sheet
 * 
 * Wrapper around the shared CollapsibleSheet component with driver-specific styling.
 * This maintains backward compatibility while using the consolidated component.
 */

import { CollapsibleSheet } from '@/components/ui/CollapsibleSheet'

interface CollapsibleDashboardSheetProps {
  children: React.ReactNode
  summaryContent?: React.ReactNode
  defaultExpanded?: boolean
}

export function CollapsibleDashboardSheet({
  children,
  summaryContent,
  defaultExpanded = true,
}: CollapsibleDashboardSheetProps) {
  return (
    <CollapsibleSheet
      summaryContent={summaryContent}
      defaultExpanded={defaultExpanded}
      bgClassName="bg-gray-900/95"
      zIndex="z-10"
    >
      {children}
    </CollapsibleSheet>
  )
}
