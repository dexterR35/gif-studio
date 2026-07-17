import { ExportModal, Toast } from '../components/ui'
import { useStudio } from '../context/studio-provider'
import { InspectorAside } from './inspector-aside'
import { ProjectAside } from './project-aside'
import { PreviewStage } from './preview-stage'
import { StudioHeader } from './studio-header'
import { ToolsRail } from './tools-rail'
import { WorkspaceNav } from './workspace-nav'

export function StudioLayout() {
  const {
    mobilePanel, setMobilePanel, exporting, frames, progress, toast,
    baseImageSelected, selectedElements, clearLayerSelection, setSelectedText,
  } = useStudio()

  const inspectorOpen = baseImageSelected || selectedElements.length > 0

  const closeInspector = () => {
    clearLayerSelection()
    setSelectedText(null)
  }

  return (
    <div className="flex h-screen max-h-screen flex-col overflow-hidden bg-ink text-zinc-100">
      <StudioHeader />
      <WorkspaceNav />

      <main className="relative flex min-h-0 flex-1 overflow-hidden">
        <ProjectAside />
        <ToolsRail />
        {(mobilePanel || inspectorOpen) && (
          <button
            type="button"
            aria-label="Close panel"
            onClick={() => {
              if (mobilePanel) setMobilePanel(false)
              if (inspectorOpen) closeInspector()
            }}
            className="absolute inset-0 z-10 bg-black/60 lg:hidden"
          />
        )}
        <PreviewStage />
        <InspectorAside />
      </main>

      <ExportModal open={exporting} frames={frames} progress={progress} />
      <Toast message={toast} />
    </div>
  )
}
