import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Layers3, Settings, Wrench } from 'lucide-react'
import {
  LIVE_REGION_ASSERTIVE_ID,
  LIVE_REGION_POLITE_ID,
} from '../a11y/live-region'
import { BusyOverlay, ExportModal, FloatingPanel, Toast } from '../components/ui'
import { useStudio } from '../context/studio-provider'
import { LAYER_WORKSPACES } from '../lib/routes'
import { InspectorAside } from './inspector-aside'
import { LayersAside } from './layers-aside'
import { ProjectAside } from './project-aside'
import { PreviewStage } from './preview-stage'
import { SelectDetectAside } from './select-detect-aside'
import { StudioHeader } from './studio-header'
import { ToolsRail } from './tools-rail'
import { WorkspaceNav } from './workspace-nav'

const FOCUS_TABS = new Set(['timeline', 'scale', 'output'])

const FOCUS_TITLES = {
  timeline: 'Timeline',
  scale: 'Scale',
  output: 'Export',
}

export function StudioLayout() {
  const {
    mobilePanel, setMobilePanel, exporting, frames, progress, toast,
    artboardSelected, baseImageSelected, selectedElements, clearLayerSelection, selectedText, setSelectedText,
    selectedOverlay, setSelectedOverlay,
    maskEditing, setMaskEditing, selectMode, setSelectMode, cancelSelection,
    activeTab, setPlaying, poseRig, image,
    studioLocked, busyLabel, scaleBusy, downloadBusy, segmenting,
  } = useStudio()

  const [floatingLayers, setFloatingLayers] = useState(false)
  const [floatingInspector, setFloatingInspector] = useState(false)
  const [floatingTools, setFloatingTools] = useState(false)

  const isFocus = FOCUS_TABS.has(activeTab)
  const isOutput = activeTab === 'output'
  const hasLayers = LAYER_WORKSPACES.has(activeTab)
  const showTools = activeTab === 'ai' || activeTab === 'motion'
  const showSelectDetect = !isFocus && Boolean(image)
  const jointsOpen = Boolean(poseRig?.panelOpen && poseRig?.joints?.length)
  const inspectorOpen = hasLayers && (
    maskEditing || selectMode || jointsOpen || artboardSelected
    || Boolean(selectedText) || baseImageSelected || selectedElements.length > 0 || Boolean(selectedOverlay)
  )

  const busyMessage = busyLabel
    || (scaleBusy ? 'Upscaling…' : '')
    || (downloadBusy ? 'Preparing PNG…' : '')
    || (segmenting ? 'Working…' : '')
    || 'Working…'

  const closeInspector = () => {
    clearLayerSelection()
    setSelectedOverlay(null)
    setSelectedText(null)
    setMaskEditing(false)
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
    if (selectMode) {
      cancelSelection()
      setSelectMode(false)
    }
  }, [hasLayers]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-screen max-h-screen flex-col overflow-hidden bg-ink text-zinc-100">
      {/* Visually hidden live regions for screen-reader announcements (Phase 13). */}
      <div
        id={LIVE_REGION_POLITE_ID}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />
      <div
        id={LIVE_REGION_ASSERTIVE_ID}
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      />

      <StudioHeader />
      <WorkspaceNav />

      <main className="relative flex min-h-0 flex-1 overflow-hidden">
        {!isFocus && (
          <>
            {!floatingTools && <ProjectAside />}
            {showSelectDetect && <SelectDetectAside />}
            {showTools && !floatingTools && <ToolsRail />}
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
            {!floatingLayers && <LayersAside />}
            {!floatingInspector && <InspectorAside />}
          </>
        )}

        {/* Detach/dock buttons */}
        {!isFocus && (
          <div className="absolute bottom-2 right-2 z-50 flex gap-1">
            <button
              type="button"
              title={floatingLayers ? 'Dock layers' : 'Float layers'}
              onClick={() => setFloatingLayers((v) => !v)}
              className="grid h-6 w-6 place-items-center rounded bg-black/60 text-zinc-400 hover:text-zinc-100 border border-white/10"
            >
              <Layers3 className="h-3 w-3" />
            </button>
            <button
              type="button"
              title={floatingInspector ? 'Dock inspector' : 'Float inspector'}
              onClick={() => setFloatingInspector((v) => !v)}
              className="grid h-6 w-6 place-items-center rounded bg-black/60 text-zinc-400 hover:text-zinc-100 border border-white/10"
            >
              <Settings className="h-3 w-3" />
            </button>
            {showTools && (
              <button
                type="button"
                title={floatingTools ? 'Dock tools' : 'Float tools'}
                onClick={() => setFloatingTools((v) => !v)}
                className="grid h-6 w-6 place-items-center rounded bg-black/60 text-zinc-400 hover:text-zinc-100 border border-white/10"
              >
                <Wrench className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </main>

      {/* Floating panels */}
      {floatingLayers && !isFocus && (
        <FloatingPanel
          id="layers"
          title="Layers"
          icon={Layers3}
          defaultPosition={{ x: window.innerWidth - 260, y: 120 }}
          defaultSize={{ w: 220, h: 420 }}
          onClose={() => setFloatingLayers(false)}
          bodyClassName="p-0"
        >
          <LayersAside floating />
        </FloatingPanel>
      )}

      {floatingInspector && inspectorOpen && !isFocus && (
        <FloatingPanel
          id="inspector"
          title="Properties"
          icon={Settings}
          defaultPosition={{ x: window.innerWidth - 320, y: 140 }}
          defaultSize={{ w: 280, h: 500 }}
          onClose={() => setFloatingInspector(false)}
        >
          <InspectorAside floating />
        </FloatingPanel>
      )}

      {floatingTools && showTools && !isFocus && (
        <FloatingPanel
          id="tools"
          title="Tools"
          icon={Wrench}
          defaultPosition={{ x: 20, y: 120 }}
          defaultSize={{ w: 200, h: 400 }}
          onClose={() => setFloatingTools(false)}
        >
          <ToolsRail floating />
        </FloatingPanel>
      )}

      <ExportModal open={exporting} frames={frames} progress={progress} />
      <BusyOverlay open={studioLocked && !exporting} message={busyMessage} />
      <Toast message={toast} />
    </div>
  )
}
