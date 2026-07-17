import { X } from 'lucide-react'
import { cn } from '../lib/cn'

/**
 * Reusable secondary (right) sidebar for selection-driven panels:
 * transform, settings, parallax scene, etc.
 * Hidden when `open` is false.
 */
export function SecondaryAside({
  open,
  title = 'Inspector',
  onClose,
  children,
  className,
  width = 228,
}) {
  return (
    <aside
      aria-hidden={!open}
      className={cn(
        'scrollbar absolute inset-y-0 right-0 z-20 h-full overflow-y-auto overscroll-contain border-l border-white/[.06] bg-panel px-3 transition-[transform,opacity,width] duration-200 lg:relative lg:inset-auto lg:shrink-0',
        open
          ? 'translate-x-0 opacity-100'
          : 'pointer-events-none translate-x-full opacity-0 lg:translate-x-0 lg:border-0 lg:px-0',
        className,
      )}
      style={{ width: open ? width : 0 }}
    >
      {open && (
        <>
          <div className="sticky top-0 z-10 flex h-11 items-center justify-between border-b border-white/[.06] bg-panel">
            <span className="text-[10px] font-semibold uppercase tracking-[.14em] text-zinc-500">
              {title}
            </span>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close panel"
                className="focus-ring rounded-md p-1 text-zinc-500 transition hover:text-zinc-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="pb-4">{children}</div>
        </>
      )}
    </aside>
  )
}
