import { Film, Maximize2, Settings2, SlidersHorizontal, Sparkles, Type, Wand2 } from 'lucide-react'
import { WorkspaceTabs } from '../components/ui'
import { useStudio } from '../context/studio-provider'
import { GIF_WORKSPACES } from '../lib/routes'

const TAB_META = {
  ai: { icon: Wand2, label: 'AI' },
  motion: { icon: Sparkles, label: 'Motion' },
  edit: { icon: SlidersHorizontal, label: 'Effects' },
  text: { icon: Type, label: 'Text' },
  timeline: { icon: Film, label: 'Timeline' },
  scale: { icon: Maximize2, label: 'Scale' },
  output: { icon: Settings2, label: 'Export' },
}

const TABS = GIF_WORKSPACES.map((id) => ({
  id,
  icon: TAB_META[id]?.icon,
  label: TAB_META[id]?.label ?? id,
}))

export function WorkspaceNav() {
  const { activeTab, goToWorkspace } = useStudio()

  return (
    <nav
      className="relative z-30 flex h-[54px] shrink-0 items-center justify-center border-b border-white/[.07] bg-panel/95 px-3 backdrop-blur-xl"
      aria-label="GIF workspaces"
    >
      <WorkspaceTabs value={activeTab} onChange={goToWorkspace} tabs={TABS} />
    </nav>
  )
}
