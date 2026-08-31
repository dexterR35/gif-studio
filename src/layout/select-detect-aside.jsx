/**
 * Left sidebar — prompt-assisted selection.
 *
 * Model choice is intentionally a backend concern. The editor sends only the
 * image and prompt to the fixed local selection pipeline.
 */
import { useState } from 'react'
import { LoaderCircle, ScanSearch } from 'lucide-react'
import { Button } from '../components/ui'
import { useStudio } from '../context/studio-provider'

export function SelectDetectAside() {
  const {
    image,
    studioLocked,
    apiAvailable,
    apiInfo,
    runTextDetect,
    setToast,
  } = useStudio()

  const [busy, setBusy] = useState('')
  const [prompt, setPrompt] = useState('')
  const locked = Boolean(busy || studioLocked)
  const selectionAvailable = Boolean(apiAvailable && apiInfo?.prompt_selection)

  const run = async () => {
    setBusy('Detect')
    try {
      await runTextDetect(prompt)
    } catch (err) {
      setToast(err?.message || 'Selection failed')
    } finally {
      setBusy('')
    }
  }

  if (!image) return null

  return (
    <aside
      aria-label="Select and detect"
      className="scrollbar flex h-full w-[228px] shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-white/[.06] bg-panel"
    >
      <div className="flex h-11 shrink-0 items-center border-b border-white/[.06] px-3">
        <span className="text-[10px] font-semibold uppercase tracking-[.14em] text-zinc-500">
          Select & detect
        </span>
      </div>

      <div className="space-y-2 px-3 py-3">
        <label className="block">
          <span className="gs-label">Text prompt</span>
          <input
            className="gs-input w-full normal-case tracking-normal"
            value={prompt}
            disabled={locked}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && prompt.trim() && !locked && selectionAvailable) run()
            }}
            placeholder="chair . person . dog ."
          />
        </label>

        <Button
          variant="accent"
          size="sm"
          full
          disabled={locked || !prompt.trim() || !selectionAvailable}
          onClick={run}
        >
          {busy
            ? <LoaderCircle className="h-3.5 w-3.5" />
            : <ScanSearch className="h-3.5 w-3.5" />}
          Find & cut out
        </Button>

        {!selectionAvailable ? (
          <p className="text-[10px] leading-snug text-zinc-600">
            Local selection service unavailable.
          </p>
        ) : null}
      </div>
    </aside>
  )
}
