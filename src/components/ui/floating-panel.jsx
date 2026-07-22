import { useCallback, useEffect, useRef, useState } from 'react'
import { GripHorizontal, Minus, X } from 'lucide-react'
import { cn } from '../../lib/cn'

const EDGE_MARGIN = 8

function clampPosition(x, y, w, h) {
  const maxX = window.innerWidth - EDGE_MARGIN
  const maxY = window.innerHeight - EDGE_MARGIN
  return {
    x: Math.max(EDGE_MARGIN - w + 40, Math.min(maxX - 40, x)),
    y: Math.max(0, Math.min(maxY - 32, y)),
  }
}

export function FloatingPanel({
  id,
  title,
  icon: Icon,
  children,
  defaultPosition,
  defaultSize,
  defaultOpen = true,
  onClose,
  className,
  bodyClassName,
  resizable = true,
  minWidth = 180,
  minHeight = 100,
}) {
  const panelRef = useRef(null)
  const dragRef = useRef(null)
  const resizeRef = useRef(null)

  const [pos, setPos] = useState(() => ({
    x: defaultPosition?.x ?? 100,
    y: defaultPosition?.y ?? 100,
  }))
  const [size, setSize] = useState(() => ({
    w: defaultSize?.w ?? 240,
    h: defaultSize?.h ?? 400,
  }))
  const [collapsed, setCollapsed] = useState(!defaultOpen)
  const [zIndex, setZIndex] = useState(100)

  const bringToFront = useCallback(() => {
    setZIndex(Date.now() % 1e8)
  }, [])

  const onDragStart = useCallback((e) => {
    if (e.button !== 0) return
    e.preventDefault()
    bringToFront()
    const rect = panelRef.current?.getBoundingClientRect()
    if (!rect) return
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: rect.left,
      originY: rect.top,
    }
    const onMove = (ev) => {
      const drag = dragRef.current
      if (!drag) return
      const dx = ev.clientX - drag.startX
      const dy = ev.clientY - drag.startY
      const clamped = clampPosition(drag.originX + dx, drag.originY + dy, size.w, 32)
      setPos(clamped)
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [size.w, bringToFront])

  const onResizeStart = useCallback((e) => {
    if (e.button !== 0) return
    e.preventDefault()
    bringToFront()
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originW: size.w,
      originH: size.h,
    }
    const onMove = (ev) => {
      const r = resizeRef.current
      if (!r) return
      setSize({
        w: Math.max(minWidth, r.originW + (ev.clientX - r.startX)),
        h: Math.max(minHeight, r.originH + (ev.clientY - r.startY)),
      })
    }
    const onUp = () => {
      resizeRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [size.w, size.h, minWidth, minHeight, bringToFront])

  useEffect(() => {
    const handler = () => {
      setPos((p) => clampPosition(p.x, p.y, size.w, 32))
    }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [size.w])

  return (
    <div
      ref={panelRef}
      data-floating-panel={id}
      className={cn(
        'fixed flex flex-col rounded-xl border border-white/[.08] bg-[#1a1a1e] shadow-2xl',
        'select-none',
        className,
      )}
      style={{
        left: pos.x,
        top: pos.y,
        width: size.w,
        zIndex,
        ...(collapsed ? {} : { height: size.h }),
      }}
      onPointerDown={bringToFront}
    >
      <div
        className="flex h-8 shrink-0 cursor-grab items-center gap-1.5 rounded-t-xl border-b border-white/[.06] bg-[#222226] px-2 active:cursor-grabbing"
        onPointerDown={onDragStart}
      >
        <GripHorizontal className="h-3 w-3 shrink-0 text-zinc-600" />
        {Icon && <Icon className="h-3 w-3 shrink-0 text-zinc-500" />}
        <span className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-[.12em] text-zinc-400">
          {title}
        </span>
        <button
          type="button"
          title={collapsed ? 'Expand' : 'Collapse'}
          className="grid h-5 w-5 place-items-center rounded text-zinc-500 hover:text-zinc-200"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setCollapsed((v) => !v)}
        >
          <Minus className="h-3 w-3" />
        </button>
        {onClose && (
          <button
            type="button"
            title="Close"
            className="grid h-5 w-5 place-items-center rounded text-zinc-500 hover:text-red-400"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {!collapsed && (
        <div className={cn('min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar', bodyClassName)}>
          {children}
        </div>
      )}

      {!collapsed && resizable && (
        <div
          className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize"
          onPointerDown={onResizeStart}
        >
          <svg viewBox="0 0 12 12" className="h-3 w-3 text-zinc-600">
            <path d="M10 2L2 10M10 6L6 10M10 10L10 10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </svg>
        </div>
      )}
    </div>
  )
}
