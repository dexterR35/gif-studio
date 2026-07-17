import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { ExportModal, Toast } from '../components/ui'
import { useStudio } from '../context/studio-provider'
import { InspectorAside } from './inspector-aside'
import { LayersAside } from './layers-aside'
import { ProjectAside } from './project-aside'
import { PreviewStage } from './preview-stage'
import { StudioHeader } from './studio-header'
import { ToolsRail } from './tools-rail'
import { WorkspaceNav } from './workspace-nav'

export function StudioLayout() {
  const {
    mobilePanel, setMobilePanel, exporting, frames, progress, toast,
    baseImageSelected, selectedElements, clearLayerSelection, setSelectedText,
    maskEditing, setMaskEditing, selectMode, setSelectMode, cancelSelection,
    activeTab, setPlaying,
  } = useStudio()

  const isOutput = activeTab === 'output'
  const inspectorOpen = !isOutput && (baseImageSelected || selectedElements.length > 0 || maskEditing || selectMode)

  const closeInspector = () => {
    clearLayerSelection()
    setSelectedText(null)
    setMaskEditing(false)
    if (selectMode) {
      cancelSelection()
      setSelectMode(false)
    }
  }

  // Clean export/preview mode — no edit chrome or selection tools.
  useEffect(() => {
    if (!isOutput) return undefined
    clearLayerSelection()
    setSelectedText(null)
    setMaskEditing(false)
    cancelSelection()
    setSelectMode(false)
    setMobilePanel(false)
    setPlaying(true)
    return () => setPlaying(false)
  }, [isOutput]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-screen max-h-screen flex-col overflow-hidden bg-ink text-zinc-100">
      <StudioHeader />
      <WorkspaceNav />

      <main className="relative flex min-h-0 flex-1 overflow-hidden">
        {!isOutput && (
          <>
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
          </>
        )}

        <PreviewStage />

        {isOutput ? (
          <aside className="scrollbar flex h-full w-[300px] shrink-0 flex-col overflow-y-auto overscroll-contain border-l border-white/[.06] bg-panel px-3.5">
            <div className="flex h-11 shrink-0 items-center border-b border-white/[.06]">
              <span className="text-[10px] font-semibold uppercase tracking-[.14em] text-zinc-500">
                Export
              </span>
            </div>
            <div className="pb-4">
              <Outlet />
            </div>
          </aside>
        ) : (
          <>
            <LayersAside />
            <InspectorAside />
          </>
        )}
      </main>

      <ExportModal open={exporting} frames={frames} progress={progress} />
      <Toast message={toast} />
    </div>
  )
}
