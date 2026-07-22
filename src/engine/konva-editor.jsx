/**
 * Primary studio canvas editor — Konva handles select, drag, resize, rotate.
 * Settings live in Zustand / StudioProvider; this is the interaction surface.
 *
 * Text resize follows Konva's Resize Text pattern:
 * https://konvajs.org/docs/select_and_transform/Resize_Text.html
 * (Transformer mutates scaleX/scaleY — bake into width/fontSize and reset scale.)
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Stage, Layer, Group, Image as KonvaImage, Text as KonvaText, Transformer, Rect, Circle, Line } from 'react-konva'
import { PRIMARY_ACCENT } from '../lib/colors'
import { POSE_BONES, POSE_KEY_JOINTS } from '../lib/pose'
import useHtmlImage from './use-html-image'
import { applyKonvaFilters } from './konva-filters'
import { captureNodeRest, seekMotion } from './konva-motion'
import {
  zoomStageAboutPointer,
  setStageZoomPct,
  resetStageZoom,
  clampArtboardPan,
  applyFitToStage,
  artboardDragBoundFunc,
} from './konva-zoom'

const TEXT_WIDTH_ANCHORS = ['middle-left', 'middle-right']
const TEXT_SCALE_ANCHORS = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
const DEFAULT_ANCHORS = [
  'top-left', 'top-right', 'bottom-left', 'bottom-right',
  'middle-left', 'middle-right', 'top-center', 'bottom-center',
]

/** Apply align/center offsets so layer.x/y map to Konva node position. */
function syncTextOffsets(node, align = 'center') {
  if (!node) return
  const w = node.width()
  const h = node.height()
  node.offsetX(align === 'left' ? 0 : align === 'right' ? w : w / 2)
  node.offsetY(h / 2)
}

/**
 * Bake Transformer scale into text width / fontSize (Konva Resize Text).
 * @see https://konvajs.org/docs/select_and_transform/Resize_Text.html
 */
function bakeTextTransform(node, { flipX = false, flipY = false, align = 'center' } = {}) {
  if (!node) return
  const sx = Math.abs(node.scaleX()) || 1
  const sy = Math.abs(node.scaleY()) || 1
  node.setAttrs({
    width: Math.max(20, node.width() * sx),
    fontSize: Math.max(8, node.fontSize() * sy),
    scaleX: flipX ? -1 : 1,
    scaleY: flipY ? -1 : 1,
  })
  syncTextOffsets(node, align)
}

function nodeToNorm(node, width, height) {
  const scaleX = Math.abs(node.scaleX()) || 1
  const scaleY = Math.abs(node.scaleY()) || 1
  const w = Math.max(0.02, (node.width() * scaleX) / width)
  const h = Math.max(0.02, (node.height() * scaleY) / height)
  // With offset set to the anchor, node.x/y is the pivot; recover unrotated top-left.
  const ax = node.width() ? node.offsetX() / node.width() : 0.5
  const ay = node.height() ? node.offsetY() / node.height() : 0.5
  const pivotX = node.x() / width
  const pivotY = node.y() / height
  return {
    x: pivotX - ax * w,
    y: pivotY - ay * h,
    w,
    h,
    rotation: node.rotation(),
    pivotX,
    pivotY,
  }
}

/** Local-space offset + stage position so rotate/scale pivot on anchor %. */
function anchorNodeProps(box, width, height, anchorX = 50, anchorY = 50) {
  const pxW = box.w * width
  const pxH = box.h * height
  const ox = ((anchorX ?? 50) / 100) * pxW
  const oy = ((anchorY ?? 50) / 100) * pxH
  return {
    x: box.x * width + ox,
    y: box.y * height + oy,
    width: pxW,
    height: pxH,
    offsetX: ox,
    offsetY: oy,
  }
}

/**
 * @param {{
 *   width: number,
 *   height: number,
 *   sourceUrl?: string|null,
 *   imageVisible?: boolean,
 *   imageTransformBox: {x:number,y:number,w:number,h:number,rotation:number},
 *   imageAnchor?: {x:number,y:number},
 *   imageLocked?: boolean,
 *   imageEdits?: {flipX?:boolean,flipY?:boolean},
 *   enhancedUrl?: string|null,
 *   enhancedVisible?: boolean,
 *   enhancedTransformBox?: {x:number,y:number,w:number,h:number,rotation:number}|null,
 *   background?: string,
 *   transparent?: boolean,
 *   elements?: Array,
 *   overlays?: Array,
 *   textLayers?: Array,
 *   selectedKind?: 'image'|'element'|'overlay'|'text'|'enhanced'|null,
 *   selectedId?: string|null,
 *   selectedIds?: string[],
 *   interactive?: boolean,
 *   progress?: number,
 *   onSelect?: (payload:{kind:string,id?:string|null,additive?:boolean})=>void,
 *   onTransformImage?: (patch:{xStart?:number,yStart?:number,xEnd?:number,yEnd?:number,scaleStart?:number,scaleEnd?:number,rotateStart?:number,rotateEnd?:number})=>void,
 *   onTransformElement?: (id:string, patch:object)=>void,
 *   onTransformOverlay?: (id:string, patch:object)=>void,
 *   onTransformText?: (id:string, patch:object)=>void,
 *   overlayBounds?: (ov:object)=>{x:number,y:number,w:number,h:number,rotation:number},
 *   selection?: {x:number,y:number,w:number,h:number}|null,
 *   selectionPoints?: Array<{x:number,y:number}>,
 *   poseJoints?: Array<{index:number,name:string,x:number,y:number,score?:number}>,
 *   showPose?: boolean,
 *   className?: string,
 * }} props
 */
export function StudioKonvaStage({
  width,
  height,
  sourceUrl,
  imageVisible = true,
  imageTransformBox,
  imageAnchor = { x: 50, y: 50 },
  imageLocked = false,
  imageEdits = {},
  enhancedUrl = null,
  enhancedVisible = true,
  enhancedTransformBox = null,
  background = '#111114',
  transparent = false,
  elements = [],
  overlays = [],
  textLayers = [],
  selectedKind = null,
  selectedId = null,
  selectedIds = [],
  interactive = true,
  onSelect,
  onTransformImage,
  onTransformElement,
  onTransformOverlay,
  onTransformText,
  overlayBounds,
  selection = null,
  selectionPoints = [],
  poseJoints = [],
  showPose = false,
  className,
  imageFilters = [],
  progress = 0,
  motionSettings = null,
  playing = false,
  onStageApi,
  onZoomChange,
  selectMode = false,
  selectionTool = 'Rectangle',
  onSelectionComplete,
  spacePan = false,
  viewportSize = null,
  onSelectionDraftChange,
}) {
  const [sourceImage] = useHtmlImage(sourceUrl)
  const [enhancedImage] = useHtmlImage(enhancedUrl)
  const trRef = useRef(null)
  const stageRef = useRef(null)
  const nodeRefs = useRef({})
  const imageRestRef = useRef(null)

  const draftRef = useRef(null) // { kind, start, points }
  const [draft, setDraft] = useState(null)
  const finishDraftRef = useRef(() => {})

  const viewW = Math.max(1, Math.round(viewportSize?.width || width))
  const viewH = Math.max(1, Math.round(viewportSize?.height || height))
  const layerDragBound = useMemo(() => artboardDragBoundFunc(width, height), [width, height])

  const getViewSize = useCallback(() => {
    const stage = stageRef.current
    return {
      vw: viewportSize?.width || stage?.width() || width,
      vh: viewportSize?.height || stage?.height() || height,
    }
  }, [viewportSize, width, height])

  useEffect(() => {
    if (!onStageApi) return undefined
    const api = {
      getStage: () => stageRef.current,
      getImageNode: () => nodeRefs.current.image || null,
      seekTo: (tNorm) => {
        const node = nodeRefs.current.image
        if (!node) return
        if (!imageRestRef.current) imageRestRef.current = captureNodeRest(node)
        seekMotion(node, imageRestRef.current, {
          preset: motionSettings?.preset || 'Still',
          amplitude: motionSettings?.amplitude ?? 0,
          speed: motionSettings?.speed ?? 1,
          duration: motionSettings?.duration ?? 1,
        }, tNorm)
        node.getLayer()?.batchDraw()
      },
      captureFrameCanvas: () => {
        const stage = stageRef.current
        if (!stage) return null
        const prevScale = { x: stage.scaleX(), y: stage.scaleY() }
        const prevPos = { x: stage.x(), y: stage.y() }
        const prevSize = { w: stage.width(), h: stage.height() }
        stage.scale({ x: 1, y: 1 })
        stage.position({ x: 0, y: 0 })
        stage.width(width)
        stage.height(height)
        const canvas = stage.toCanvas({ pixelRatio: 1, x: 0, y: 0, width, height })
        stage.width(prevSize.w)
        stage.height(prevSize.h)
        stage.scale(prevScale)
        stage.position(prevPos)
        return canvas
      },
      setZoomPct: (zoomPct) => {
        const stage = stageRef.current
        if (!stage) return
        const { vw, vh } = getViewSize()
        const result = setStageZoomPct(stage, zoomPct, width, height, vw, vh)
        if (result) onZoomChange?.(result.zoomPct, { x: result.x, y: result.y })
      },
      setZoomPan: (zoomPct, pan) => {
        const stage = stageRef.current
        if (!stage) return
        const { vw, vh } = getViewSize()
        if (pan && (pan.x != null || pan.y != null)) {
          const s = Math.max(0.05, (Number(zoomPct) || 100) / 100)
          stage.scale({ x: s, y: s })
          const pos = clampArtboardPan(pan.x || 0, pan.y || 0, s, vw, vh, width, height)
          stage.position(pos)
          stage.batchDraw()
          onZoomChange?.(Math.round(s * 100), pos)
          return
        }
        api.setZoomPct(zoomPct)
      },
      fit: (vw, vh) => {
        const stage = stageRef.current
        if (!stage) return
        const view = {
          vw: vw || getViewSize().vw,
          vh: vh || getViewSize().vh,
        }
        const f = applyFitToStage(stage, view.vw, view.vh, width, height, 40)
        if (f) onZoomChange?.(f.zoomPct, { x: f.x, y: f.y })
      },
      resetZoom: () => {
        const stage = stageRef.current
        if (!stage) return
        const { vw, vh } = getViewSize()
        const f = resetStageZoom(stage, vw, vh, width, height)
        if (f) onZoomChange?.(f.zoomPct, { x: f.x, y: f.y })
      },
      finishSelectionDraft: () => finishDraftRef.current?.(),
      undoSelectionPoint: () => {
        const d = draftRef.current
        if (!d?.points?.length) return
        const next = { ...d, points: d.points.slice(0, -1) }
        draftRef.current = next
        setDraft(next)
      },
      getZoomPan: () => {
        const stage = stageRef.current
        if (!stage) return { zoomPct: 100, x: 0, y: 0 }
        return { zoomPct: Math.round((stage.scaleX() || 1) * 100), x: stage.x(), y: stage.y() }
      },
    }
    onStageApi(api)
    return () => onStageApi(null)
  }, [onStageApi, width, height, motionSettings, onZoomChange, getViewSize])

  // Auto-fit + center when artboard or viewport size changes.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage || !viewportSize?.width || !viewportSize?.height) return
    const f = applyFitToStage(stage, viewportSize.width, viewportSize.height, width, height, 40)
    if (f) onZoomChange?.(f.zoomPct, { x: f.x, y: f.y })
  }, [width, height, viewportSize?.width, viewportSize?.height])

  // Refresh rest pose when base transform / image changes (idle only).
  useEffect(() => {
    if (playing) return
    const node = nodeRefs.current.image
    if (!node) return
    imageRestRef.current = captureNodeRest(node)
  }, [playing, imageTransformBox, sourceImage, imageEdits, width, height])

  // Seek motion while scrubbing / playing.
  useEffect(() => {
    const node = nodeRefs.current.image
    if (!node || !motionSettings) return
    if (!imageRestRef.current) imageRestRef.current = captureNodeRest(node)
    seekMotion(node, imageRestRef.current, {
      preset: motionSettings.preset || 'Still',
      amplitude: motionSettings.amplitude ?? 0,
      speed: motionSettings.speed ?? 1,
      duration: motionSettings.duration ?? 1,
    }, progress)
    node.getLayer()?.batchDraw()
  }, [progress, motionSettings, playing, sourceImage])

  // Konva Filters on base image.
  useEffect(() => {
    const node = nodeRefs.current.image
    if (!node || !sourceImage) return
    applyKonvaFilters(node, imageFilters)
  }, [imageFilters, sourceImage, imageTransformBox])


  const setNodeRef = (key, node) => {
    if (node) nodeRefs.current[key] = node
    else delete nodeRefs.current[key]
  }

  const selectedKey = useMemo(() => {
    if (!selectedKind) return null
    if (selectedKind === 'image') return 'image'
    if (selectedId) return `${selectedKind}:${selectedId}`
    return null
  }, [selectedKind, selectedId])

  useEffect(() => {
    const tr = trRef.current
    if (!tr) return
    if (!interactive || !selectedKey || (selectedKind === 'image' && imageLocked)) {
      tr.nodes([])
      tr.getLayer()?.batchDraw()
      return
    }
    const node = nodeRefs.current[selectedKey]
    if (node && !node.isDragging()) {
      tr.nodes([node])
      tr.getLayer()?.batchDraw()
    } else {
      tr.nodes([])
    }
  }, [selectedKey, selectedKind, imageLocked, interactive, elements, overlays, textLayers, imageTransformBox, sourceImage])

  const box = imageTransformBox || { x: 0, y: 0, w: 1, h: 1, rotation: 0 }

  const commitImageTransform = (node) => {
    const n = nodeToNorm(node, width, height)
    const cx = n.x + n.w / 2
    const cy = n.y + n.h / 2
    onTransformImage?.({
      centerX: cx,
      centerY: cy,
      boxW: n.w,
      boxH: n.h,
      rotation: n.rotation,
      pivotX: n.pivotX,
      pivotY: n.pivotY,
    })
    node.scaleX(imageEdits.flipX ? -1 : 1)
    node.scaleY(imageEdits.flipY ? -1 : 1)
  }

  const commitElement = (id, node, el) => {
    const n = nodeToNorm(node, width, height)
    onTransformElement?.(id, {
      x: +n.x.toFixed(4),
      y: +n.y.toFixed(4),
      w: +n.w.toFixed(4),
      h: +n.h.toFixed(4),
      rotation: +n.rotation.toFixed(1),
      scaleX: 100,
      scaleY: 100,
    })
    const ox = ((el.anchorX ?? 50) / 100) * n.w * width
    const oy = ((el.anchorY ?? 50) / 100) * n.h * height
    node.scaleX(el.flipX ? -1 : 1)
    node.scaleY(el.flipY ? -1 : 1)
    node.width(n.w * width)
    node.height(n.h * height)
    node.offsetX(ox)
    node.offsetY(oy)
    node.x(n.x * width + ox)
    node.y(n.y * height + oy)
  }

  const commitOverlay = (id, node, overlay) => {
    const n = nodeToNorm(node, width, height)
    const cx = (n.x + n.w / 2) * 100
    const cy = (n.y + n.h / 2) * 100
    const widthPct = (n.w * 100) / Math.max(0.01, (overlay.scaleX || 100) / 100)
    onTransformOverlay?.(id, {
      x: +cx.toFixed(1),
      y: +cy.toFixed(1),
      width: +Math.max(2, widthPct).toFixed(1),
      rotation: +n.rotation.toFixed(1),
    })
    node.scaleX(1)
    node.scaleY(1)
  }

  const commitText = (id, node, layer) => {
    bakeTextTransform(node, {
      flipX: layer.flipX,
      flipY: layer.flipY,
      align: layer.align || 'center',
    })
    // With align offsets, node.x/y is the same origin canvas 2D uses (textAlign point).
    onTransformText?.(id, {
      x: +((node.x() / width) * 100).toFixed(1),
      y: +((node.y() / height) * 100).toFixed(1),
      rotation: +node.rotation().toFixed(1),
      size: +node.fontSize().toFixed(1),
      boxWidth: +Math.max(20, node.width()).toFixed(1),
      scaleX: 100,
      scaleY: 100,
    })
  }

  const textSelected = selectedKind === 'text'
  const transformerAnchors = textSelected
    ? [...TEXT_WIDTH_ANCHORS, ...TEXT_SCALE_ANCHORS]
    : DEFAULT_ANCHORS

  const stageToNorm = (pos) => ({
    x: Math.max(0, Math.min(1, pos.x / width)),
    y: Math.max(0, Math.min(1, pos.y / height)),
  })

  const finishDraft = useCallback((extraPoints = []) => {
    const d = draftRef.current
    if (!d) return
    draftRef.current = null
    setDraft(null)
    if (d.kind === 'rect' && d.rect) {
      const r = d.rect
      if (r.w < 0.025 || r.h < 0.025) return
      onSelectionComplete?.({ type: 'rect', rect: r })
      return
    }
    const points = [...(d.points || []), ...extraPoints]
    if (points.length < 3) return
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    const rect = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    }
    if (rect.w < 0.015 || rect.h < 0.015) return
    onSelectionComplete?.({ type: 'path', rect, points, tool: d.kind })
  }, [onSelectionComplete])

  finishDraftRef.current = finishDraft

  useEffect(() => {
    onSelectionDraftChange?.(draft?.points || [])
  }, [draft, onSelectionDraftChange])

  useEffect(() => {
    if (selectMode) return
    draftRef.current = null
    setDraft(null)
  }, [selectMode])

  // Expose finish for Enter / Complete button via stage API patch
  useEffect(() => {
    const stage = stageRef.current
    if (!stage || !selectMode) return undefined
    const onKey = (event) => {
      if (event.key === 'Enter') finishDraft()
      if (event.key === 'Escape') {
        draftRef.current = null
        setDraft(null)
      }
      if ((event.key === 'Backspace' || event.key === 'Delete') && draftRef.current?.points?.length) {
        event.preventDefault()
        const next = draftRef.current.points.slice(0, -1)
        draftRef.current = { ...draftRef.current, points: next }
        setDraft({ ...draftRef.current })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectMode, finishDraft])

  return (
    <Stage
      ref={stageRef}
      width={viewW}
      height={viewH}
      className={className}
      style={{ width: '100%', height: '100%' }}
      draggable={spacePan && !selectMode}
      dragBoundFunc={(pos) => {
        const stage = stageRef.current
        const s = stage?.scaleX() || 1
        return clampArtboardPan(pos.x, pos.y, s, viewW, viewH, width, height)
      }}
      onDragEnd={() => {
        const stage = stageRef.current
        if (!stage) return
        onZoomChange?.(Math.round((stage.scaleX() || 1) * 100), { x: stage.x(), y: stage.y() })
      }}
      onWheel={(e) => {
        e.evt.preventDefault()
        const stage = stageRef.current
        if (!stage) return
        const pointer = stage.getPointerPosition()
        if (!pointer) return
        const oldScale = stage.scaleX() || 1
        const scaleBy = 1.08
        const direction = e.evt.deltaY > 0 ? -1 : 1
        const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy
        const result = zoomStageAboutPointer(stage, pointer, newScale, viewW, viewH, width, height)
        if (result) onZoomChange?.(result.zoomPct, { x: result.x, y: result.y })
      }}
      onMouseDown={(e) => {
        if (spacePan) return
        const stage = stageRef.current
        if (!stage) return
        // Selection drawing (Konva)
        if (selectMode) {
          const pos = stage.getRelativePointerPosition()
          if (!pos) return
          const point = stageToNorm(pos)
          if (selectionTool === 'Polygonal Lasso' || selectionTool === 'Pen Path') {
            const prev = draftRef.current?.points || []
            const next = { kind: selectionTool === 'Pen Path' ? 'pen' : 'polygon', points: [...prev, point] }
            draftRef.current = next
            setDraft(next)
            return
          }
          if (selectionTool === 'Freehand Lasso') {
            const next = { kind: 'freehand', points: [point], drawing: true }
            draftRef.current = next
            setDraft(next)
            return
          }
          // Rectangle
          const next = { kind: 'rect', start: point, rect: { x: point.x, y: point.y, w: 0, h: 0 }, drawing: true }
          draftRef.current = next
          setDraft(next)
          return
        }
        if (!interactive) return
        if (e.target === e.target.getStage()) onSelect?.({ kind: 'image', id: null })
      }}
      onMouseMove={() => {
        if (!selectMode || !draftRef.current?.drawing) return
        const stage = stageRef.current
        if (!stage) return
        const pos = stage.getRelativePointerPosition()
        if (!pos) return
        const point = stageToNorm(pos)
        const d = draftRef.current
        if (d.kind === 'freehand') {
          const last = d.points[d.points.length - 1]
          if (!last || Math.hypot(last.x - point.x, last.y - point.y) > 0.002) {
            const next = { ...d, points: [...d.points, point] }
            draftRef.current = next
            setDraft(next)
          }
          return
        }
        if (d.kind === 'rect' && d.start) {
          const rect = {
            x: Math.min(d.start.x, point.x),
            y: Math.min(d.start.y, point.y),
            w: Math.abs(point.x - d.start.x),
            h: Math.abs(point.y - d.start.y),
          }
          const next = { ...d, rect }
          draftRef.current = next
          setDraft(next)
        }
      }}
      onMouseUp={() => {
        if (!selectMode || !draftRef.current?.drawing) return
        const d = draftRef.current
        if (d.kind === 'rect' || d.kind === 'freehand') {
          finishDraft()
        }
      }}
      onDblClick={() => {
        if (selectMode && (selectionTool === 'Polygonal Lasso' || selectionTool === 'Pen Path')) {
          finishDraft()
        }
      }}
      onTouchStart={(e) => {
        if (!interactive || selectMode) return
        if (e.target === e.target.getStage()) onSelect?.({ kind: 'image', id: null })
      }}
    >
      <Layer listening={interactive}>
        <Group
          clipFunc={(ctx) => {
            ctx.rect(0, 0, width, height)
          }}
        >
        <Rect
          width={width}
          height={height}
          fill={transparent ? undefined : background}
          listening={false}
        />

        {enhancedImage && enhancedVisible !== false && enhancedTransformBox && (() => {
          const ebox = enhancedTransformBox
          const pivotX = ((imageAnchor?.x ?? 50) / 100) * width
          const pivotY = ((imageAnchor?.y ?? 50) / 100) * height
          const ox = pivotX - ebox.x * width
          const oy = pivotY - ebox.y * height
          return (
            <KonvaImage
              ref={(n) => setNodeRef('enhanced', n)}
              name="enhanced-underlay"
              image={enhancedImage}
              x={pivotX}
              y={pivotY}
              width={ebox.w * width}
              height={ebox.h * height}
              offsetX={ox}
              offsetY={oy}
              rotation={ebox.rotation || 0}
              listening={interactive}
              onClick={(e) => {
                e.cancelBubble = true
                onSelect?.({ kind: 'enhanced' })
              }}
              onTap={(e) => {
                e.cancelBubble = true
                onSelect?.({ kind: 'enhanced' })
              }}
            />
          )
        })()}

        {sourceImage && imageVisible !== false && (() => {
          // Base-image anchor is canvas %; convert to local offset within the fitted box.
          const pivotX = ((imageAnchor?.x ?? 50) / 100) * width
          const pivotY = ((imageAnchor?.y ?? 50) / 100) * height
          const ox = pivotX - box.x * width
          const oy = pivotY - box.y * height
          const flipX = Boolean(imageEdits.flipX)
          const flipY = Boolean(imageEdits.flipY)
          return (
            <KonvaImage
              ref={(n) => setNodeRef('image', n)}
              name="base-image"
              image={sourceImage}
              x={pivotX}
              y={pivotY}
              width={box.w * width}
              height={box.h * height}
              offsetX={ox}
              offsetY={oy}
              rotation={box.rotation || 0}
              scaleX={flipX ? -1 : 1}
              scaleY={flipY ? -1 : 1}
              draggable={interactive && !imageLocked}
              dragBoundFunc={layerDragBound}
              onClick={(e) => {
                e.cancelBubble = true
                onSelect?.({ kind: 'image' })
              }}
              onTap={(e) => {
                e.cancelBubble = true
                onSelect?.({ kind: 'image' })
              }}
              onDragEnd={(e) => commitImageTransform(e.target)}
              onTransformEnd={(e) => commitImageTransform(e.target)}
            />
          )
        })()}

        {overlays.filter((ov) => ov.visible !== false).map((overlay) => {
          const b = overlayBounds?.(overlay) || { x: 0.2, y: 0.2, w: 0.3, h: 0.3, rotation: 0 }
          const key = `overlay:${overlay.id}`
          const props = anchorNodeProps(b, width, height, overlay.anchorX, overlay.anchorY)
          return (
            <KonvaImage
              key={overlay.id}
              ref={(n) => setNodeRef(key, n)}
              image={overlay.image}
              {...props}
              rotation={b.rotation || 0}
              opacity={(overlay.opacity ?? 100) / 100}
              scaleX={overlay.flipX ? -1 : 1}
              scaleY={overlay.flipY ? -1 : 1}
              draggable={interactive}
              dragBoundFunc={layerDragBound}
              onClick={(e) => {
                e.cancelBubble = true
                onSelect?.({ kind: 'overlay', id: overlay.id, additive: e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey })
              }}
              onTap={(e) => {
                e.cancelBubble = true
                onSelect?.({ kind: 'overlay', id: overlay.id })
              }}
              onDragEnd={(e) => commitOverlay(overlay.id, e.target, overlay)}
              onTransformEnd={(e) => commitOverlay(overlay.id, e.target, overlay)}
            />
          )
        })}

        {elements.filter((el) => el.visible !== false).map((el) => {
          const key = `element:${el.id}`
          const selected = selectedIds.includes(el.id) || selectedId === el.id
          const boxEl = { x: el.x, y: el.y, w: el.w, h: el.h }
          const props = anchorNodeProps(boxEl, width, height, el.anchorX, el.anchorY)
          return (
            <KonvaImage
              key={el.id}
              ref={(n) => setNodeRef(key, n)}
              image={el.bitmap}
              {...props}
              rotation={el.rotation || 0}
              opacity={(el.opacity ?? 100) / 100}
              scaleX={(el.scaleX || 100) / 100 * (el.flipX ? -1 : 1)}
              scaleY={(el.scaleY || 100) / 100 * (el.flipY ? -1 : 1)}
              draggable={interactive && !el.locked}
              dragBoundFunc={layerDragBound}
              dash={el.locked ? [4, 4] : undefined}
              stroke={selected ? '#d8ff3e' : undefined}
              strokeWidth={selected ? 2 : 0}
              onClick={(e) => {
                e.cancelBubble = true
                onSelect?.({ kind: 'element', id: el.id, additive: e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey })
              }}
              onTap={(e) => {
                e.cancelBubble = true
                onSelect?.({ kind: 'element', id: el.id })
              }}
              onDragEnd={(e) => commitElement(el.id, e.target, el)}
              onTransformEnd={(e) => commitElement(el.id, e.target, el)}
            />
          )
        })}

        {textLayers.filter((layer) => layer.visible !== false).map((layer) => {
          const key = `text:${layer.id}`
          const align = layer.align || 'center'
          const fontSize = Math.max(8, layer.size || 72)
          const hasBoxWidth = layer.boxWidth != null && Number(layer.boxWidth) > 0
          return (
            <KonvaText
              key={layer.id}
              ref={(n) => {
                setNodeRef(key, n)
                if (n && !n.isDragging() && !n.isTransforming?.()) {
                  syncTextOffsets(n, align)
                }
              }}
              text={layer.text || 'Text'}
              x={(layer.x / 100) * width}
              y={(layer.y / 100) * height}
              fontSize={fontSize}
              fontFamily={layer.font || 'Arial'}
              fontStyle={`${layer.italic ? 'italic ' : ''}${layer.weight || 700}`}
              fill={layer.color || '#ffffff'}
              opacity={(layer.opacity ?? 100) / 100}
              rotation={layer.rotation || 0}
              align={align}
              lineHeight={layer.lineHeight || 1.1}
              letterSpacing={layer.letterSpacing || 0}
              stroke={layer.strokeWidth > 0 ? (layer.strokeColor || '#000') : undefined}
              strokeWidth={layer.strokeWidth || 0}
              shadowColor={layer.shadowBlur > 0 || layer.shadowX || layer.shadowY ? layer.shadowColor : undefined}
              shadowBlur={layer.shadowBlur || 0}
              shadowOffsetX={layer.shadowX || 0}
              shadowOffsetY={layer.shadowY || 0}
              {...(hasBoxWidth ? { width: Number(layer.boxWidth) } : {})}
              scaleX={layer.flipX ? -1 : 1}
              scaleY={layer.flipY ? -1 : 1}
              draggable={interactive && !layer.locked}
              dragBoundFunc={layerDragBound}
              onClick={(e) => {
                e.cancelBubble = true
                onSelect?.({ kind: 'text', id: layer.id })
              }}
              onTap={(e) => {
                e.cancelBubble = true
                onSelect?.({ kind: 'text', id: layer.id })
              }}
              onTransform={() => {
                const node = nodeRefs.current[key]
                if (!node) return
                // https://konvajs.org/docs/select_and_transform/Resize_Text.html
                bakeTextTransform(node, {
                  flipX: layer.flipX,
                  flipY: layer.flipY,
                  align,
                })
                trRef.current?.forceUpdate()
              }}
              onDragEnd={(e) => commitText(layer.id, e.target, layer)}
              onTransformEnd={(e) => commitText(layer.id, e.target, layer)}
            />
          )
        })}

        {selection && (
          <Rect
            x={selection.x * width}
            y={selection.y * height}
            width={selection.w * width}
            height={selection.h * height}
            stroke={PRIMARY_ACCENT}
            strokeWidth={2}
            fill="rgba(200,245,66,0.12)"
            listening={false}
          />
        )}

        {selectionPoints.length > 0 && (
          <>
            <Line
              points={selectionPoints.flatMap((p) => [p.x * width, p.y * height])}
              stroke={PRIMARY_ACCENT}
              strokeWidth={2}
              closed={false}
              listening={false}
            />
            {selectionPoints.map((p, i) => (
              <Circle
                key={`pt-${i}`}
                x={p.x * width}
                y={p.y * height}
                radius={3}
                fill={PRIMARY_ACCENT}
                listening={false}
              />
            ))}
          </>
        )}

        {showPose && poseJoints.length > 0 && (
          <>
            {POSE_BONES.map(([a, b]) => {
              const ja = poseJoints.find((j) => j.index === a)
              const jb = poseJoints.find((j) => j.index === b)
              if (!ja || !jb || (ja.score ?? 1) < 0.25 || (jb.score ?? 1) < 0.25) return null
              return (
                <Line
                  key={`bone-${a}-${b}`}
                  points={[ja.x * width, ja.y * height, jb.x * width, jb.y * height]}
                  stroke={PRIMARY_ACCENT}
                  strokeWidth={2}
                  lineCap="round"
                  listening={false}
                  opacity={0.9}
                />
              )
            })}
            {poseJoints.map((j) => {
              if ((j.score ?? 1) < 0.25) return null
              const key = POSE_KEY_JOINTS.includes(j.name)
              return (
                <Circle
                  key={`joint-${j.index}`}
                  x={j.x * width}
                  y={j.y * height}
                  radius={key ? 4 : 2.5}
                  fill={PRIMARY_ACCENT}
                  stroke={key ? '#111' : undefined}
                  strokeWidth={key ? 1 : 0}
                  listening={false}
                />
              )
            })}
          </>
        )}


        {/* Live Konva selection draft */}
        {draft?.kind === 'rect' && draft.rect && (
          <Rect
            x={draft.rect.x * width}
            y={draft.rect.y * height}
            width={draft.rect.w * width}
            height={draft.rect.h * height}
            stroke={PRIMARY_ACCENT}
            strokeWidth={2 / Math.max(0.01, stageRef.current?.scaleX?.() || 1)}
            fill="rgba(200,245,66,0.12)"
            listening={false}
          />
        )}
        {draft?.points?.length > 0 && (
          <>
            <Line
              points={draft.points.flatMap((p) => [p.x * width, p.y * height])}
              stroke={PRIMARY_ACCENT}
              strokeWidth={2 / Math.max(0.01, stageRef.current?.scaleX?.() || 1)}
              closed={false}
              listening={false}
            />
            {draft.points.map((p, i) => (
              <Circle
                key={`draft-pt-${i}`}
                x={p.x * width}
                y={p.y * height}
                radius={3 / Math.max(0.01, stageRef.current?.scaleX?.() || 1)}
                fill={PRIMARY_ACCENT}
                listening={false}
              />
            ))}
          </>
        )}
        </Group>

        {/* Artboard frame (outside clip so it stays crisp at edges) */}
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={1 / Math.max(0.01, stageRef.current?.scaleX?.() || 1)}
          listening={false}
        />

      </Layer>
      <Layer listening={interactive}>
        {interactive && (
          <Transformer
            ref={trRef}
            rotateEnabled
            enabledAnchors={transformerAnchors}
            keepRatio={false}
            boundBoxFunc={(oldBox, newBox) => (
              newBox.width < 8 || newBox.height < 8 ? oldBox : newBox
            )}
            borderStroke={PRIMARY_ACCENT}
            anchorFill="#ffffff"
            anchorStroke="#111"
            anchorSize={8}
          />
        )}
      </Layer>
    </Stage>
  )
}

export { StudioKonvaStage as KonvaEditor }
