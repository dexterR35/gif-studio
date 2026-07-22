/**
 * Viewport chrome helpers (fullscreen, space key, zoom % state for ZoomControls).
 * Artboard zoom/pan is owned by Konva Stage — see engine/konva-zoom.js.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

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

  const zoomTo = useCallback((nextZoom) => {
    setZoom(nextZoom)
  }, [setZoom])

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
      if (document.fullscreenElement) await document.exitFullscreen()
      else await node.requestFullscreen()
    } catch {
      /* blocked */
    }
  }, [])

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
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

  // Legacy no-ops — Stage owns wheel/pan (konva-zoom.js).
  const onWheel = useCallback((event) => { event.preventDefault() }, [])
  const beginPan = useCallback(() => false, [])
  const movePan = useCallback(() => false, [])
  const endPan = useCallback(() => false, [])

  /** @deprecated Stage fills the viewport; kept for API compat. */
  const getContentStyle = useCallback(() => ({
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
  }), [])

  return {
    viewportRef,
    zoom,
    setZoom,
    pan,
    setPan,
    spaceDown,
    isFullscreen,
    isPanning: false,
    setContentSize,
    fit,
    reset,
    zoomIn,
    zoomOut,
    toggleFullscreen,
    onWheel,
    beginPan,
    movePan,
    endPan,
    getContentStyle,
  }
}
