import { AlertTriangle, Check, Info, LoaderCircle, XCircle } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Progress } from './progress'

export function Modal({ open, children, className }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm">
      <div className={cn('w-[min(90vw,380px)] rounded-3xl border border-white/10 bg-panel p-6 text-center shadow-2xl', className)}>
        {children}
      </div>
    </div>
  )
}

export function ExportModal({ open, frames, progress }) {
  return (
    <Modal open={open}>
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-acid/10 text-acid">
        <LoaderCircle className="h-6 w-6 animate-spin" />
      </div>
      <h2 className="display mt-4 text-lg font-bold">Building your GIF</h2>
      <p className="mt-2 text-xs text-zinc-500">Rendering {frames} frames locally in your browser.</p>
      <Progress value={progress * 100} className="mt-5" />
      <p className="mt-2 text-right font-mono text-[10px] text-zinc-600">{Math.round(progress * 100)}%</p>
    </Modal>
  )
}

/**
 * Blocks the studio while AI / upscale / download runs.
 * Dim overlay keeps initiating button spinners visible underneath.
 */
export function BusyOverlay({ open, message = 'Working…' }) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 cursor-wait bg-black/45 backdrop-blur-[1px]"
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label={message}
    >
      <div className="pointer-events-none absolute bottom-8 left-1/2 flex max-w-[min(92vw,360px)] -translate-x-1/2 items-center gap-2.5 rounded-xl border border-white/10 bg-panel/95 px-4 py-3 shadow-2xl">
        <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-acid" />
        <span className="text-xs font-semibold text-zinc-100">{message}</span>
      </div>
    </div>
  )
}

const TOAST_STYLES = {
  success: {
    Icon: Check,
    wrap: 'border-emerald-500/30 bg-zinc-900/95 text-emerald-100',
    icon: 'text-acid',
  },
  error: {
    Icon: XCircle,
    wrap: 'border-red-500/35 bg-zinc-900/95 text-red-100',
    icon: 'text-red-400',
  },
  warning: {
    Icon: AlertTriangle,
    wrap: 'border-amber-500/35 bg-zinc-900/95 text-amber-100',
    icon: 'text-amber-400',
  },
  info: {
    Icon: Info,
    wrap: 'border-sky-500/30 bg-zinc-900/95 text-zinc-100',
    icon: 'text-sky-400',
  },
}

/** @param {{ message?: string|{message?:string,type?:string}|null, type?: string, className?: string }} props */
export function Toast({ message, type, className }) {
  const payload = typeof message === 'object' && message !== null
    ? message
    : { message, type }
  const text = payload?.message
  if (!text) return null
  const kind = TOAST_STYLES[payload.type || type || 'info'] ? (payload.type || type || 'info') : 'info'
  const { Icon, wrap, icon } = TOAST_STYLES[kind]
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={cn(
        'toast fixed bottom-5 left-1/2 z-[60] flex max-w-[min(92vw,420px)] -translate-x-1/2 items-start gap-2 rounded-xl border px-4 py-3 text-xs font-semibold shadow-2xl',
        wrap,
        className,
      )}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', icon)} />
      <span className="whitespace-pre-wrap break-words leading-relaxed">{text}</span>
    </div>
  )
}
