import { CanvasSizeControls, Hint, Section, Switch, ZoomControls } from '../components/ui'
import { useStudio } from '../context/studio-provider'

/** GIF workspace: live preview controls (part of /gif — uses GIF studio state). */
export default function GifPreviewPage() {
  const {
    playing, setPlaying, settings, update,
    frames, actualFps, actualDuration, progress, canvasZoom,
    source, lockAspect, setLockAspect, setCanvasWidth, setCanvasHeight, useSourceSize, memory,
  } = useStudio()

  return (
    <>
      <Section title="Live preview" info="This preview belongs to the GIF app. Edits from Motion, Text, Frames, and Edit show up here.">
        <ZoomControls
          zoom={canvasZoom.zoom}
          onZoomChange={canvasZoom.setZoom}
          onZoomIn={canvasZoom.zoomIn}
          onZoomOut={canvasZoom.zoomOut}
          onFit={canvasZoom.fit}
          onReset={canvasZoom.reset}
          onFullscreen={canvasZoom.toggleFullscreen}
          isFullscreen={canvasZoom.isFullscreen}
          className="justify-end"
        />
        <div className="mt-4"><Switch label="Play animation" checked={playing} onChange={setPlaying} /></div>
      </Section>

      <Section title="Canvas readout" info="Canvas size drives export resolution and render memory. Shrink it to reduce MB.">
        <CanvasSizeControls
          width={settings.width}
          height={settings.height}
          fit={settings.fit}
          lockAspect={lockAspect}
          sourceWidth={source.width}
          sourceHeight={source.height}
          memoryBytes={memory}
          onWidthChange={setCanvasWidth}
          onHeightChange={setCanvasHeight}
          onFitChange={(v) => update('fit', v)}
          onLockAspectChange={setLockAspect}
          onUseSourceSize={useSourceSize}
        />
        <Hint className="mt-3">
          <b className="text-zinc-300">{frames}</b> frames · <b className="text-zinc-300">{actualFps.toFixed(2)}</b> fps ·{' '}
          <b className="text-zinc-300">{(progress * actualDuration).toFixed(1)}s</b> / {actualDuration.toFixed(1)}s
        </Hint>
      </Section>
    </>
  )
}
