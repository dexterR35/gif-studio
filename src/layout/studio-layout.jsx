import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { ExportModal, Toast } from '../components/ui'
import { useStudio } from '../context/studio-provider'
import { LAYER_WORKSPACES } from '../lib/routes'
import { InspectorAside } from './inspector-aside'
import { LayersAside } from './layers-aside'
import { ProjectAside } from './project-aside'
import { PreviewStage } from './preview-stage'
import { StudioHeader } from './studio-header'
import { ToolsRail } from './tools-rail'
import { WorkspaceNav } from './workspace-nav'

const FOCUS_TABS = new Set(['timeline', 'output'])

const FOCUS_TITLES = {
  timeline: 'Timeline',
  output: 'Export',
}

export function StudioLayout() {
  const {
    mobilePanel, setMobilePanel, exporting, frames, progress, toast,
    artboardSelected, baseImageSelected, selectedElements, clearLayerSelection, selectedText, setSelectedText,
    selectedOverlay, setSelectedOverlay,
    maskEditing, setMaskEditing, selectMode, setSelectMode, cancelSelection,
    censorSelecting, setCensorSelecting,
    activeTab, setPlaying, poseRig,
  } = useStudio()

  const isFocus = FOCUS_TABS.has(activeTab)
  const isOutput = activeTab === 'output'
  const hasLayers = LAYER_WORKSPACES.has(activeTab)
  const effectsTab = activeTab === 'edit'
  const showTools = activeTab === 'ai' || activeTab === 'motion'
  const jointsOpen = Boolean(poseRig?.panelOpen && poseRig?.joints?.length)
  // Effects tab: processing settings stay pinned on the right; Background / Transform on other tabs.
  const inspectorOpen = hasLayers && (
    effectsTab
    || maskEditing || selectMode || censorSelecting || jointsOpen || artboardSelected
    || (!effectsTab && (Boolean(selectedText) || baseImageSelected || selectedElements.length > 0 || Boolean(selectedOverlay)))
  )

  const closeInspector = () => {
    clearLayerSelection()
    setSelectedOverlay(null)
    setSelectedText(null)
    setMaskEditing(false)
    setCensorSelecting(false)
    if (selectMode) {
      cancelSelection()
      setSelectMode(false)
    }
  }

  // Focus workspaces: clear edit chrome so the stage + right panel stay clean.
  useEffect(() => {
    if (!isFocus) return undefined
    clearLayerSelection()
    setSelectedText(null)
    setMaskEditing(false)
    setCensorSelecting(false)
    cancelSelection()
    setSelectMode(false)
    setMobilePanel(false)
    if (isOutput) setPlaying(true)
    return () => {
      if (isOutput) setPlaying(false)
    }
  }, [isFocus, isOutput]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tools that need a selection target only clear when leaving layer workspaces.
  useEffect(() => {
    if (hasLayers) return
    clearLayerSelection()
    setSelectedOverlay(null)
    setMaskEditing(false)
    setCensorSelecting(false)
    if (selectMode) {
      cancelSelection()
      setSelectMode(false)
    }
  }, [hasLayers]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-screen max-h-screen flex-col overflow-hidden bg-ink text-zinc-100">
      <StudioHeader />
      <WorkspaceNav />

      <main className="relative flex min-h-0 flex-1 overflow-hidden">
        {!isFocus && (
          <>
            <ProjectAside />
            {showTools && <ToolsRail />}
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

        {isFocus ? (
          <aside className="scrollbar flex h-full w-[300px] shrink-0 flex-col overflow-y-auto overscroll-contain border-l border-white/[.06] bg-panel px-3.5">
            <div className="flex h-11 shrink-0 items-center border-b border-white/[.06]">
              <span className="text-[10px] font-semibold uppercase tracking-[.14em] text-zinc-500">
                {FOCUS_TITLES[activeTab] || 'Panel'}
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
