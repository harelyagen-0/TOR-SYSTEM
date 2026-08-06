/**
 * Route-level error boundary. A render crash shows a recovery screen with a
 * reload action instead of a white page. Errors are logged (and, once wired,
 * reported to Sentry — P7-4).
 */
import { Component, type ReactNode } from 'react'
import { he } from '../locale/he'

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error('[render error]', error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="grid min-h-dvh place-items-center bg-page p-6 text-center">
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm font-bold text-muted">{he.errors.crashed}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-11 rounded-field bg-primary px-5 text-sm font-semibold text-on-primary"
            >
              {he.errors.reload}
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
