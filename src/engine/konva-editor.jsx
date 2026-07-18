/**
 * Primary studio canvas editor — Konva handles select, drag, resize, rotate.
 * Settings live in Zustand / StudioProvider; this is the interaction surface.
 */
import { useEffect, useMemo, useRef } from 'react'
import { Stage, Layer, Image as KonvaImage, Text as KonvaText, Transformer, Rect, Circle, Line } from 'react-konva'
import { PRIMARY_ACCENT } from '../lib/colors'
import { POSE_BONES, POSE_KEY_JOINTS } from '../lib/pose'
import useHtmlImage from './use-html-image'

function nodeToNorm(node, width, height) {
  const scaleX = node.scaleX()
  const scaleY = node.scaleY()
  const w = Math.max(0.02, (node.width() * scaleX) / width)
  const h = Math.max(0.02, (node.height() * scaleY) / height)
  return {
    x: node.x() / width,
    y: node.y() / height,
    w,
    h,
    rotation: node.rotation(),
  }
}

/**
 * @param {{
 *   width: number,
 *   height: number,
 *   sourceUrl?: string|null,
 *   imageTransformBox: {x:number,y:number,w:number,h:number,rotation:number},
 *   imageLocked?: boolean,
 *   imageEdits?: {flipX?:boolean,flipY?:boolean},
 *   background?: string,
 *   transparent?: boolean,
 *   elements?: Array,
 *   overlays?: Array,
 *   textLayers?: Array,
 *   selectedKind?: 'image'|'element'|'overlay'|'text'|null,
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
 *   textBounds?: (layer:object)=>{left:number,top:number,width:number,height:number},
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
  imageTransformBox,
  imageLocked = false,
  imageEdits = {},
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
  textBounds,
  selection = null,
  selectionPoints = [],
  poseJoints = [],
  showPose = false,
  className,
}) {
  const [sourceImage] = useHtmlImage(sourceUrl)
  const trRef = useRef(null)
  const stageRef = useRef(null)
  const nodeRefs = useRef({})

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
    // Unscaled fitted size ≈ current box / current scale factor; parent maps center→offsets.
    onTransformImage?.({
      centerX: cx,
      centerY: cy,
      boxW: n.w,
      boxH: n.h,
      rotation: n.rotation,
    })
    node.scaleX(imageEdits.flipX ? -1 : 1)
    node.scaleY(imageEdits.flipY ? -1 : 1)
  }

  const commitElement = (id, node) => {
    const n = nodeToNorm(node, width, height)
    onTransformElement?.(id, {
      x: +n.x.toFixed(4),
      y: +n.y.toFixed(4),
      w: +n.w.toFixed(4),
      h: +n.h.toFixed(4),
      rotation: +n.rotation.toFixed(1),
    })
    node.scaleX(1)
    node.scaleY(1)
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
    // Konva uses top-left; draw()/textBounds use center %. Convert back.
    const boxW = Math.max(1, node.width() * Math.abs(node.scaleX() || 1))
    const boxH = Math.max(1, node.height() * Math.abs(node.scaleY() || 1))
    const leftPct = (node.x() / width) * 100
    const topPct = (node.y() / height) * 100
    const widthPct = (boxW / width) * 100
    const heightPct = (boxH / height) * 100
    const align = layer.align || 'center'
    const centerX = align === 'left'
      ? leftPct
      : align === 'right'
        ? leftPct + widthPct
        : leftPct + widthPct / 2
    const centerY = topPct + heightPct / 2
    onTransformText?.(id, {
      x: +centerX.toFixed(1),
      y: +centerY.toFixed(1),
      rotation: +node.rotation().toFixed(1),
      scaleX: +(layer.scaleX * node.scaleX()).toFixed(1),
      scaleY: +(layer.scaleY * node.scaleY()).toFixed(1),
    })
    node.scaleX(1)
    node.scaleY(1)
  }

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      className={className}
      style={{ width: '100%', height: '100%' }}
      onMouseDown={(e) => {
        if (!interactive) return
        if (e.target === e.target.getStage()) onSelect?.({ kind: 'image', id: null })
      }}
      onTouchStart={(e) => {
        if (!interactive) return
        if (e.target === e.target.getStage()) onSelect?.({ kind: 'image', id: null })
      }}
    >
      <Layer>
        <Rect
          width={width}
          height={height}
          fill={transparent ? undefined : background}
          listening={false}
        />

        {sourceImage && (
          <KonvaImage
            ref={(n) => setNodeRef('image', n)}
            name="base-image"
            image={sourceImage}
            x={box.x * width}
            y={box.y * height}
            width={box.w * width}
            height={box.h * height}
            rotation={box.rotation || 0}
            scaleX={imageEdits.flipX ? -1 : 1}
            scaleY={imageEdits.flipY ? -1 : 1}
            offsetX={imageEdits.flipX ? box.w * width : 0}
            offsetY={imageEdits.flipY ? box.h * height : 0}
            draggable={interactive && !imageLocked}
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
        )}

        {overlays.filter((ov) => ov.visible !== false).map((overlay) => {
          const b = overlayBounds?.(overlay) || { x: 0.2, y: 0.2, w: 0.3, h: 0.3, rotation: 0 }
          const key = `overlay:${overlay.id}`
          return (
            <KonvaImage
              key={overlay.id}
              ref={(n) => setNodeRef(key, n)}
              image={overlay.image}
              x={b.x * width}
              y={b.y * height}
              width={b.w * width}
              height={b.h * height}
              rotation={b.rotation || 0}
              opacity={(overlay.opacity ?? 100) / 100}
              draggable={interactive}
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
          return (
            <KonvaImage
              key={el.id}
              ref={(n) => setNodeRef(key, n)}
              image={el.bitmap}
              x={el.x * width}
              y={el.y * height}
              width={el.w * width}
              height={el.h * height}
              rotation={el.rotation || 0}
              opacity={(el.opacity ?? 100) / 100}
              scaleX={(el.scaleX || 100) / 100 * (el.flipX ? -1 : 1)}
              scaleY={(el.scaleY || 100) / 100 * (el.flipY ? -1 : 1)}
              draggable={interactive && !el.locked}
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
              onDragEnd={(e) => {
                // Reset flip/scale baked into attrs before normalizing
                const node = e.target
                const sx = Math.abs(node.scaleX()) || 1
                const sy = Math.abs(node.scaleY()) || 1
                onTransformElement?.(el.id, {
                  x: +(node.x() / width).toFixed(4),
                  y: +(node.y() / height).toFixed(4),
                  w: +((node.width() * sx) / width).toFixed(4),
                  h: +((node.height() * sy) / height).toFixed(4),
                  rotation: +node.rotation().toFixed(1),
                  scaleX: 100,
                  scaleY: 100,
                })
                node.scaleX(el.flipX ? -1 : 1)
                node.scaleY(el.flipY ? -1 : 1)
                node.width((el.w * width))
                node.height((el.h * height))
              }}
              onTransformEnd={(e) => {
                const node = e.target
                const sx = Math.abs(node.scaleX()) || 1
                const sy = Math.abs(node.scaleY()) || 1
                onTransformElement?.(el.id, {
                  x: +(node.x() / width).toFixed(4),
                  y: +(node.y() / height).toFixed(4),
                  w: +((node.width() * sx) / width).toFixed(4),
                  h: +((node.height() * sy) / height).toFixed(4),
                  rotation: +node.rotation().toFixed(1),
                  scaleX: 100,
                  scaleY: 100,
                })
                node.scaleX(el.flipX ? -1 : 1)
                node.scaleY(el.flipY ? -1 : 1)
              }}
            />
          )
        })}

        {textLayers.filter((layer) => layer.visible !== false).map((layer) => {
          const key = `text:${layer.id}`
          const boxPct = textBounds?.(layer)
          const x = boxPct ? (boxPct.left / 100) * width : (layer.x / 100) * width
          const y = boxPct ? (boxPct.top / 100) * height : (layer.y / 100) * height
          return (
            <KonvaText
              key={layer.id}
              ref={(n) => setNodeRef(key, n)}
              text={layer.text || 'Text'}
              x={x}
              y={y}
              fontSize={Math.max(8, (layer.size || 72) * (layer.scaleY || 100) / 100)}
              fontFamily={layer.font || 'Arial'}
              fontStyle={`${layer.italic ? 'italic ' : ''}${layer.weight || 700}`}
              fill={layer.color || '#ffffff'}
              opacity={(layer.opacity ?? 100) / 100}
              rotation={layer.rotation || 0}
              align={layer.align || 'center'}
              draggable={interactive && !layer.locked}
              onClick={(e) => {
                e.cancelBubble = true
                onSelect?.({ kind: 'text', id: layer.id })
              }}
              onTap={(e) => {
                e.cancelBubble = true
                onSelect?.({ kind: 'text', id: layer.id })
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

        {interactive && (
          <Transformer
            ref={trRef}
            rotateEnabled
            enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']}
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
