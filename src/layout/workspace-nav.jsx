import { Film, Settings2, SlidersHorizontal, Sparkles, Type } from 'lucide-react'
import { WorkspaceTabs } from '../components/ui'
import { useStudio } from '../context/studio-provider'
import { GIF_WORKSPACES } from '../lib/routes'

const TAB_META = {
  motion: { icon: Sparkles, label: 'Motion' },
  text: { icon: Type, label: 'Text' },
  edit: { icon: SlidersHorizontal, label: 'Effects' },
  timeline: { icon: Film, label: 'Timeline' },
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
