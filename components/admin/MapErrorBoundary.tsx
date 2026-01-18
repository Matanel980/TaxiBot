'use client'

import React from 'react'
import { AlertCircle } from 'lucide-react'

interface MapErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class MapErrorBoundary extends React.Component<
  React.PropsWithChildren<{}>,
  MapErrorBoundaryState
> {
  constructor(props: React.PropsWithChildren<{}>) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): MapErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[MapErrorBoundary] Map rendering error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full bg-slate-900 flex items-center justify-center p-4">
          <div className="text-center max-w-md">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">שגיאת מפה</h3>
            <p className="text-sm text-slate-400 mb-4">
              התרחשה שגיאה בטעינת המפה. המפה תעודכן אוטומטית.
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              נסה שוב
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}





