import { useCallback, useEffect, useRef, useState } from 'react'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

/**
 * Figma-style canvas zoom/pan for a viewport + content pair.
 * Scroll zooms toward the cursor; Space/middle-mouse pans.
 */
export function useCanvasZoom({
  minZoom = 10,
  maxZoom = 800,
  zoomStep = 1.12,
  defaultZoom = 100,
  padding = 48,
} = {}) {
  const viewportRef = useRef(null)
  const [zoom, setZoomState] = useState(defaultZoom)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [spaceDown, setSpaceDown] = useState(false)
  const panDrag = useRef(null)
  const contentSize = useRef({ width: 800, height: 600 })

  const setContentSize = useCallback((width, height) => {
    contentSize.current = {
      width: Math.max(1, width),
      height: Math.max(1, height),
    }
  }, [])

  const setZoom = useCallback((next) => {
    setZoomState((current) => {
      const value = typeof next === 'function' ? next(current) : next
      return Math.round(clamp(value, minZoom, maxZoom))
    })
  }, [minZoom, maxZoom])

  const zoomTo = useCallback((nextZoom, anchor) => {
    const viewport = viewportRef.current
    if (!viewport) {
      setZoom(nextZoom)
      return
    }

    const rect = viewport.getBoundingClientRect()
    const cx = anchor?.x ?? rect.width / 2
    const cy = anchor?.y ?? rect.height / 2

    setZoomState((currentZoom) => {
      const clamped = Math.round(clamp(nextZoom, minZoom, maxZoom))
      const prev = currentZoom / 100
      const next = clamped / 100

      setPan((currentPan) => {
        const worldX = (cx - rect.width / 2 - currentPan.x) / prev
        const worldY = (cy - rect.height / 2 - currentPan.y) / prev
        return {
          x: cx - rect.width / 2 - worldX * next,
          y: cy - rect.height / 2 - worldY * next,
        }
      })

      return clamped
    })
  }, [minZoom, maxZoom])

  const fit = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const rect = viewport.getBoundingClientRect()
    const { width, height } = contentSize.current
    const availableW = Math.max(1, rect.width - padding * 2)
    const availableH = Math.max(1, rect.height - padding * 2)
    const next = Math.round(clamp(Math.min(availableW / width, availableH / height) * 100, minZoom, maxZoom))
    setZoomState(next)
    setPan({ x: 0, y: 0 })
  }, [minZoom, maxZoom, padding])

  const reset = useCallback(() => {
    setZoomState(100)
    setPan({ x: 0, y: 0 })
  }, [])

  const zoomIn = useCallback(() => {
    zoomTo(zoom * zoomStep)
  }, [zoom, zoomStep, zoomTo])

  const zoomOut = useCallback(() => {
    zoomTo(zoom / zoomStep)
  }, [zoom, zoomStep, zoomTo])

  const toggleFullscreen = useCallback(async () => {
    const node = viewportRef.current?.closest('[data-canvas-stage]') || viewportRef.current
    if (!node) return

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await node.requestFullscreen()
      }
    } catch {
      // Fullscreen may be blocked by the browser; ignore.
    }
  }, [])

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
      // Re-fit after chrome chrome changes the viewport size.
      requestAnimationFrame(() => {
        // Keep current zoom; only recenter if needed when entering fullscreen.
      })
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code === 'Space' && !event.repeat && !event.target.matches('input, textarea, select, [contenteditable]')) {
        event.preventDefault()
        setSpaceDown(true)
      }
      const meta = event.metaKey || event.ctrlKey
      if (!meta) return
      if (event.key === '=' || event.key === '+') {
        event.preventDefault()
        zoomTo(zoom * zoomStep)
      } else if (event.key === '-') {
        event.preventDefault()
        zoomTo(zoom / zoomStep)
      } else if (event.key === '0') {
        event.preventDefault()
        fit()
      } else if (event.key === '1') {
        event.preventDefault()
        reset()
      }
    }
    const onKeyUp = (event) => {
      if (event.code === 'Space') setSpaceDown(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [fit, reset, zoom, zoomStep, zoomTo])

  const onWheel = useCallback((event) => {
    event.preventDefault()
    const viewport = viewportRef.current
    if (!viewport) return

    const rect = viewport.getBoundingClientRect()
    const anchor = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }

    // Pinch-zoom / ctrl+wheel and plain scroll both zoom (canvas-style).
    const direction = event.deltaY > 0 ? 1 / zoomStep : zoomStep
    const intensity = Math.min(3, Math.abs(event.deltaY) / 100)
    const factor = direction > 1 ? zoomStep ** intensity : (1 / zoomStep) ** intensity
    zoomTo(zoom * factor, anchor)
  }, [zoom, zoomStep, zoomTo])

  const beginPan = useCallback((event) => {
    const isMiddle = event.button === 1
    const isSpaceLeft = spaceDown && event.button === 0
    if (!isMiddle && !isSpaceLeft) return false

    event.preventDefault()
    panDrag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    }
    viewportRef.current?.setPointerCapture?.(event.pointerId)
    return true
  }, [pan.x, pan.y, spaceDown])

  const movePan = useCallback((event) => {
    const drag = panDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return false
    setPan({
      x: drag.originX + (event.clientX - drag.startX),
      y: drag.originY + (event.clientY - drag.startY),
    })
    return true
  }, [])

  const endPan = useCallback((event) => {
    if (!panDrag.current || panDrag.current.pointerId !== event.pointerId) return false
    panDrag.current = null
    return true
  }, [])

  const contentStyle = {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: contentSize.current.width,
    height: contentSize.current.height,
    transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom / 100})`,
    transformOrigin: 'center center',
    willChange: 'transform',
  }

  const getContentStyle = useCallback((width, height) => ({
    position: 'absolute',
    left: '50%',
    top: '50%',
    width,
    height,
    transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom / 100})`,
    transformOrigin: 'center center',
    willChange: 'transform',
  }), [pan.x, pan.y, zoom])

  return {
    viewportRef,
    zoom,
    setZoom,
    pan,
    setPan,
    spaceDown,
    isFullscreen,
    isPanning: Boolean(panDrag.current) || spaceDown,
    setContentSize,
    fit,
    reset,
    zoomIn,
    zoomOut,
    zoomTo,
    toggleFullscreen,
    onWheel,
    beginPan,
    movePan,
    endPan,
    contentStyle,
    getContentStyle,
  }
}
