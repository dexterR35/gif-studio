import {
  BoxSelect,
  Brush,
  Eraser,
  FlipHorizontal2,
  FlipVertical2,
  Hexagon,
  Lasso,
  LoaderCircle,
  Move,
  MousePointerClick,
  PenTool,
  RotateCcw,
  RotateCw,
  Scissors,
} from 'lucide-react'
import { useStudio } from '../context/studio-provider'
import { useStudioStore } from '../store/studio-store'
import { capabilityButtonProps } from '../a11y/capability-honesty'
import { cn } from '../lib/cn'

const MOVE_TOOL = 'Move'
const MASK_TOOL = 'Mask'
const ERASE_TOOL = 'Erase'
const REMOVE_TOOL = 'RemoveFromImage'
const OBJECT_CUT_TOOL = 'Object Cut'

const SELECTION_TOOLS = [
  {
    id: 'Rectangle',
    label: 'Rectangle marquee',
    hint: 'Drag a box around the object',
    icon: BoxSelect,
  },
  {
    id: 'Freehand Lasso',
    label: 'Freehand lasso',
    hint: 'Draw around the object continuously',
    icon: Lasso,
  },
  {
    id: 'Polygonal Lasso',
    label: 'Polygonal lasso',
    hint: 'Click anchors, then Complete or Enter',
    icon: Hexagon,
  },
  {
    id: 'Pen Path',
    label: 'Pen path',
    hint: 'Click anchors for a precise path',
    icon: PenTool,
  },
]

/**
 * Photoshop-style vertical tool rail — sits after the project aside.
 */
export function ToolsRail({ floating = false }) {
  const {
    selectMode, setSelectMode, selectionTool, setSelectionTool,
    cancelSelection, setSelection, setSelectionPoints,
    setMobilePanel, maskEditing, setMaskEditing, studioLocked, segmenting,
    selectedElement, setToast, setBaseImageSelected,
    toggleFlip, rotateSelection, selectionFlip,
    baseImageSelected,
    beginMaskErase, maskBrush, setMaskBrush,
    selectionPurpose, setSelectionPurpose, beginRemoveFromImage,
    image, apiAvailable, apiInfo,
  } = useStudio()
  const caps = useStudioStore((s) => s.capabilities)
  const pendingSelection = useStudioStore((s) => s.tools.pendingSelection)
  const inpaintBtn = capabilityButtonProps(caps, 'lama', 'Remove from image')
  const inpaintEngine = 'LaMa'

  const erasing = maskEditing && maskBrush.mode === 'Hide'
  const revealing = maskEditing && maskBrush.mode !== 'Hide'
  const removeMode = (selectMode && selectionPurpose === 'erase') || Boolean(pendingSelection?.rect)
  const locked = Boolean(studioLocked)

  const activeId = erasing
    ? ERASE_TOOL
    : revealing
      ? MASK_TOOL
      : removeMode
        ? REMOVE_TOOL
        : selectMode
          ? selectionTool
          : MOVE_TOOL
  const hasTarget = Boolean(selectedElement || baseImageSelected)
  const flipHint = selectedElement
    ? 'Flip selected layer'
    : 'Flip base image (select base or a layer first)'

  const activateMove = () => {
    cancelSelection()
    setSelectMode(false)
    setMaskEditing(false)
    setSelectionPurpose('cutout')
  }

  const activateSelection = (toolId) => {
    cancelSelection()
    setSelection(null)
    setSelectionPoints([])
    setSelectionPurpose('cutout')
    setSelectionTool(toolId)
    setSelectMode(true)
    setMaskEditing(false)
    setMobilePanel(false)
    setBaseImageSelected(false)
  }

  const activateObjectCut = () => {
    if (!image) {
      setToast('Open an image first')
      return
    }
    if (!apiAvailable || !apiInfo?.point_selection) {
      setToast('Point cut needs the local selection service')
      return
    }
    activateSelection(OBJECT_CUT_TOOL)
    setToast('Point cut — click the object you want as a new layer')
  }

  const activateMask = () => {
    if (!selectedElement) {
      setToast('Select a layer first to paint a mask')
      return
    }
    cancelSelection()
    setSelectMode(false)
    setMaskBrush((current) => ({ ...current, mode: 'Reveal' }))
    setMaskEditing(true)
    setMobilePanel(false)
    setBaseImageSelected(false)
  }

  const activateErase = () => {
    if (!selectedElement) {
      setToast('Select a cutout layer — then brush away hair, hand, or box edges')
      return
    }
    cancelSelection()
    setSelectMode(false)
    beginMaskErase(selectedElement)
    setMobilePanel(false)
    setToast('Erase brush — paint to delete wrong path; the box shrinks')
  }

  return (
    <aside
      aria-label="Tools"
      className={floating
        ? 'flex w-full flex-col items-center gap-0.5 py-2'
        : 'flex h-full w-11 shrink-0 flex-col items-center gap-0.5 border-r border-white/[.06] bg-panel py-2'}
    >
      <ToolButton
        label="Move"
        hint="Select and transform layers"
        icon={Move}
        active={activeId === MOVE_TOOL}
        disabled={locked}
        onClick={activateMove}
      />

      <div className="my-1.5 h-px w-6 bg-white/[.08]" />

      <ToolButton
        label="Point cut"
        hint="Click an object to cut its exact contour into a new layer"
        icon={MousePointerClick}
        active={activeId === OBJECT_CUT_TOOL}
        disabled={locked || !image || !apiAvailable || !apiInfo?.point_selection}
        onClick={activateObjectCut}
      />

      {SELECTION_TOOLS.map((tool) => (
        <ToolButton
          key={tool.id}
          label={tool.label}
          hint={tool.hint}
          icon={tool.icon}
          active={activeId === tool.id}
          disabled={locked}
          onClick={() => activateSelection(tool.id)}
        />
      ))}

      <ToolButton
        label="Remove from image"
        hint={inpaintBtn.disabled
          ? inpaintBtn.title
          : `Draw a box, then press Cut · ${inpaintEngine}`}
        icon={Scissors}
        active={activeId === REMOVE_TOOL}
        disabled={locked || inpaintBtn.disabled}
        onClick={() => beginRemoveFromImage('Rectangle')}
      />

      <div className="my-1.5 h-px w-6 bg-white/[.08]" />

      <ToolButton
        label="Flip horizontal"
        hint={flipHint}
        icon={FlipHorizontal2}
        active={hasTarget && selectionFlip.flipX}
        disabled={locked}
        onClick={() => toggleFlip('x')}
      />
      <ToolButton
        label="Flip vertical"
        hint={flipHint}
        icon={FlipVertical2}
        active={hasTarget && selectionFlip.flipY}
        disabled={locked}
        onClick={() => toggleFlip('y')}
      />
      <ToolButton
        label="Rotate −90°"
        hint="Rotate selected layer or base image"
        icon={RotateCcw}
        disabled={locked}
        onClick={() => rotateSelection(-90)}
      />
      <ToolButton
        label="Rotate +90°"
        hint="Rotate selected layer or base image"
        icon={RotateCw}
        disabled={locked}
        onClick={() => rotateSelection(90)}
      />

      <div className="my-1.5 h-px w-6 bg-white/[.08]" />

      <ToolButton
        label="Erase path"
        hint="Brush-delete wrong cutout pixels (hair/hand). Bounds shrink after each stroke."
        icon={Eraser}
        active={activeId === ERASE_TOOL}
        disabled={locked}
        onClick={activateErase}
      />
      <ToolButton
        label="Mask paint"
        hint="Reveal / restore mask pixels — options open in the properties panel"
        icon={Brush}
        active={activeId === MASK_TOOL}
        disabled={locked}
        onClick={activateMask}
      />

      {segmenting && (
        <div
          className="mt-auto pb-2"
          title="Separating object…"
          role="status"
          aria-label="Separating object"
        >
          <LoaderCircle className="h-4 w-4 text-acid" aria-hidden="true" />
        </div>
      )}
    </aside>
  )
}

function ToolButton({ label, hint, icon: Icon, active, disabled, onClick }) {
  return (
    <button
      type="button"
      title={`${label}${hint ? ` — ${hint}` : ''}`}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'focus-ring grid h-9 w-9 place-items-center rounded-md',
        active
          ? 'bg-acid text-black'
          : 'text-zinc-400 hover:bg-white/[.06] hover:text-zinc-100',
        disabled && 'pointer-events-none opacity-40',
      )}
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} />
    </button>
  )
}
