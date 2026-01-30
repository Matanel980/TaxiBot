'use client'

/**
 * Admin Trip Sheet Collapsible Component
 * 
 * Wrapper around the shared CollapsibleSheet component with admin-specific styling.
 * This maintains backward compatibility while using the consolidated component.
 */

import { CollapsibleSheet } from '@/components/ui/CollapsibleSheet'

interface CollapsibleTripSheetProps {
  children: React.ReactNode
  summaryContent?: React.ReactNode
  defaultExpanded?: boolean
}

export function CollapsibleTripSheet({
  children,
  summaryContent,
  defaultExpanded = true,
}: CollapsibleTripSheetProps) {
  return (
    <CollapsibleSheet
      summaryContent={summaryContent}
      defaultExpanded={defaultExpanded}
      bgClassName="bg-slate-900/95"
      zIndex="z-40"
    >
      {children}
    </CollapsibleSheet>
  )
}
