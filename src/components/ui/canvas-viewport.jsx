import { useEffect, useRef } from 'react'
import { cn } from '../../lib/cn'

/**
 * Overflow viewport around the artboard.
 * Children fill the viewport; Konva Stage owns zoom/pan/centering.
 */
export function CanvasViewport({
  zoomApi,
  contentWidth,
  contentHeight,
  className,
  children,
  panEnabled = false,
  wheelEnabled = false,
  autoFit = true,
  onBackgroundPointerDown,
  onViewportResize,
}) {
  const {
    viewportRef,
    onWheel,
    beginPan,
    movePan,
    endPan,
    spaceDown,
    setContentSize,
    fit,
  } = zoomApi
  const didFit = useRef(false)
  const lastSize = useRef('')

  useEffect(() => {
    setContentSize(contentWidth, contentHeight)
  }, [contentWidth, contentHeight, setContentSize])

  useEffect(() => {
    const node = viewportRef.current
    if (!node) return undefined

    const notify = () => {
      onViewportResize?.({ width: node.clientWidth, height: node.clientHeight })
    }
    notify()
    const observer = new ResizeObserver(notify)
    observer.observe(node)
    return () => observer.disconnect()
  }, [viewportRef, onViewportResize])

  useEffect(() => {
    if (!autoFit) return undefined
    const node = viewportRef.current
    if (!node) return undefined

    const sizeKey = `${contentWidth}x${contentHeight}`
    const runFit = () => {
      setContentSize(contentWidth, contentHeight)
      fit()
      didFit.current = true
      lastSize.current = sizeKey
      onViewportResize?.({ width: node.clientWidth, height: node.clientHeight })
    }

    if (!didFit.current || lastSize.current !== sizeKey) runFit()

    const observer = new ResizeObserver(() => {
      if (!didFit.current) runFit()
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [autoFit, contentWidth, contentHeight, fit, setContentSize, viewportRef, onViewportResize])

  useEffect(() => {
    if (!wheelEnabled) return undefined
    const node = viewportRef.current
    if (!node) return undefined
    const handler = (event) => onWheel(event)
    node.addEventListener('wheel', handler, { passive: false })
    return () => node.removeEventListener('wheel', handler)
  }, [onWheel, viewportRef, wheelEnabled])

  return (
    <div
      ref={viewportRef}
      className={cn(
        'checker relative flex min-h-0 flex-1 touch-none overflow-hidden',
        spaceDown && panEnabled ? 'cursor-grab' : '',
        className,
      )}
      onPointerDownCapture={(event) => {
        if (panEnabled && beginPan(event)) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !spaceDown) {
          onBackgroundPointerDown?.(event)
        }
      }}
      onPointerMove={(event) => {
        if (panEnabled && movePan(event)) event.stopPropagation()
      }}
      onPointerUp={(event) => {
        if (panEnabled && endPan(event)) event.stopPropagation()
      }}
      onPointerCancel={(event) => {
        if (panEnabled && endPan(event)) event.stopPropagation()
      }}
      onContextMenu={(event) => {
        if (event.button === 1) event.preventDefault()
      }}
    >
      {/* Stage fills the viewport; artboard is centered/scaled inside Konva. */}
      <div className="absolute inset-0 min-h-0 min-w-0">
        {children}
      </div>
    </div>
  )
}
