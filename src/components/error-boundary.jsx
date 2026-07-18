import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useStudioStore } from '../store/studio-store'

/**
 * Catches render/runtime errors in the studio tree and shows a recovery UI.
 * Also pushes an error toast when the store is available.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Studio error boundary:', error, info)
    try {
      useStudioStore.getState().notifyError(
        error?.message || 'Something went wrong in the studio.',
      )
    } catch {
      /* store may be unavailable during hard failures */
    }
  }

  handleReload = () => {
    this.setState({ error: null })
    if (typeof this.props.onReset === 'function') {
      this.props.onReset()
      return
    }
    window.location.reload()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const message = error?.message || 'Unexpected studio error'
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-ink px-6 text-center text-zinc-100">
        <div className="grid h-14 w-14 place-items-center rounded-2xl border border-red-500/30 bg-red-500/10 text-red-300">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h1 className="display mt-5 text-2xl font-bold tracking-tight">Studio crashed</h1>
        <p className="mt-2 max-w-md text-sm text-zinc-400">
          {message}
        </p>
        <button
          type="button"
          onClick={this.handleReload}
          className="focus-ring mt-6 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-800 px-4 py-2.5 text-xs font-semibold text-zinc-100 hover:border-white/20"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reload studio
        </button>
      </div>
    )
  }
}
