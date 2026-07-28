/**
 * Last line of defence: a render-time crash used to blank the whole screen
 * with no explanation. This keeps the operator informed and gives them a way
 * back rather than a white page mid-shift.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { he } from '../locale/he'

interface State { error: Error | null }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[studio-os] render crash', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <p className="text-base font-bold">{he.errors.crashTitle}</p>
          <p className="text-sm text-muted">{he.errors.crashBody}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex min-h-11 items-center rounded-field bg-primary px-4 text-sm font-semibold text-on-primary"
          >
            {he.errors.reload}
          </button>
        </div>
      </div>
    )
  }
}
