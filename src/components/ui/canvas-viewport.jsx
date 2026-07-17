import { useEffect, useRef } from 'react'
import { cn } from '../../lib/cn'

/**
 * Scroll-to-zoom / space-pan viewport for canvas-style stages.
 */
export function CanvasViewport({
  zoomApi,
  contentWidth,
  contentHeight,
  className,
  children,
  panEnabled = true,
  autoFit = true,
  onBackgroundPointerDown,
}) {
  const {
    viewportRef,
    onWheel,
    beginPan,
    movePan,
    endPan,
    spaceDown,
    getContentStyle,
    setContentSize,
    fit,
  } = zoomApi
  const didFit = useRef(false)
  const lastSize = useRef('')

  useEffect(() => {
    setContentSize(contentWidth, contentHeight)
  }, [contentWidth, contentHeight, setContentSize])

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
    }

    if (!didFit.current || lastSize.current !== sizeKey) runFit()

    const observer = new ResizeObserver(() => {
      if (!didFit.current) runFit()
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [autoFit, contentWidth, contentHeight, fit, setContentSize, viewportRef])

  useEffect(() => {
    const node = viewportRef.current
    if (!node) return undefined
    const handler = (event) => onWheel(event)
    node.addEventListener('wheel', handler, { passive: false })
    return () => node.removeEventListener('wheel', handler)
  }, [onWheel, viewportRef])

  return (
    <div
      ref={viewportRef}
      className={cn(
        'checker relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden',
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
        // Checker / empty stage around the canvas — deselect like Figma/Photoshop.
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
      <div
        style={getContentStyle(contentWidth, contentHeight)}
        onPointerDown={(event) => {
          // Clicks on the content wrapper chrome (outside the stage child) also clear selection.
          if (event.target === event.currentTarget && !spaceDown) {
            onBackgroundPointerDown?.(event)
          }
        }}
      >
        {children}
      </div>
    </div>
  )
}
