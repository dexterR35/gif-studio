import { Check, LoaderCircle } from 'lucide-react'
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

export function Toast({ message, className }) {
  if (!message) return null
  return (
    <div className={cn('toast fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-xl border border-white/10 bg-zinc-800 px-4 py-3 text-xs font-semibold shadow-2xl', className)}>
      <Check className="h-4 w-4 text-acid" />
      {message}
    </div>
  )
}
