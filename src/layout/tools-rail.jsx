import {
  BoxSelect,
  Hexagon,
  Lasso,
  LoaderCircle,
  Move,
  PenTool,
} from 'lucide-react'
import { useStudio } from '../context/studio-provider'
import { cn } from '../lib/cn'

const MOVE_TOOL = 'Move'

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
export function ToolsRail() {
  const {
    selectMode, setSelectMode, selectionTool, setSelectionTool,
    cancelSelection, setSelection, setSelectionPoints,
    setPlaying, setMobilePanel, setMaskEditing, segmenting,
    goToWorkspace, activeTab,
  } = useStudio()

  const activeId = selectMode ? selectionTool : MOVE_TOOL

  const activateMove = () => {
    cancelSelection()
    setSelectMode(false)
    setMaskEditing(false)
  }

  const activateSelection = (toolId) => {
    cancelSelection()
    setSelection(null)
    setSelectionPoints([])
    setSelectionTool(toolId)
    setSelectMode(true)
    setMaskEditing(false)
    setPlaying(false)
    setMobilePanel(false)
    if (activeTab !== 'elements') goToWorkspace('elements')
  }

  return (
    <aside
      aria-label="Tools"
      className="flex h-full w-11 shrink-0 flex-col items-center gap-0.5 border-r border-white/[.06] bg-panel py-2"
    >
      <ToolButton
        label="Move"
        hint="Select and transform layers"
        icon={Move}
        active={activeId === MOVE_TOOL}
        onClick={activateMove}
      />

      <div className="my-1.5 h-px w-6 bg-white/[.08]" />

      {SELECTION_TOOLS.map((tool) => (
        <ToolButton
          key={tool.id}
          label={tool.label}
          hint={tool.hint}
          icon={tool.icon}
          active={activeId === tool.id}
          disabled={segmenting}
          onClick={() => activateSelection(tool.id)}
        />
      ))}

      {segmenting && (
        <div className="mt-auto pb-2" title="Separating object…">
          <LoaderCircle className="h-4 w-4 animate-spin text-acid" />
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
        'focus-ring grid h-9 w-9 place-items-center rounded-md transition',
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
