/**
 * Download & install local AI models (SAM2, DINO, YOLO, …).
 * Shown when /api/health reports missing weights.
 *
 * Polls /api/models/install only while an install is running — not forever.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Download, HardDriveDownload, LoaderCircle } from 'lucide-react'
import { apiClient } from '../../api/js-client'
import {
  coreModelsMissing,
  summarizeMissingModels,
} from '../../ai/models-install'
import { Button } from '../ui'
import { useStudio } from '../../context/studio-provider'
import { useStudioStore } from '../../store/studio-store'

/** Shared install status so header + aside share one poller. */
let sharedStatus = null
/** @type {Set<() => void>} */
const listeners = new Set()
let lastNotifiedKey = ''
/** @type {ReturnType<typeof setInterval> | null} */
let pollTimer = null
let polling = false

function emit() {
  listeners.forEach((fn) => fn())
}

function setSharedStatus(next) {
  sharedStatus = next
  emit()
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return sharedStatus
}

/**
 * One-shot status read (no interval).
 * @returns {Promise<Record<string, unknown>|null>}
 */
async function fetchInstallStatusOnce() {
  try {
    const { data } = await apiClient.getModelsInstallStatus()
    setSharedStatus(data)
    return data
  } catch (err) {
    const status = err?.status
    const message = String(err?.message || '')
    if (status === 404 || /404|not found/i.test(message)) {
      const failed = {
        status: 'failed',
        progress: 0,
        message: 'Restart the local API to enable model install',
        error: 'Install endpoint missing — restart npm run api / npm run start',
      }
      setSharedStatus(failed)
      return failed
    }
    return null
  }
}

/**
 * Poll only while install is running. Stops automatically when idle/done/failed.
 * @param {{
 *   refreshApiHealth?: () => Promise<unknown>,
 *   setToast?: (msg: string) => void,
 * }} hooks
 */
function ensurePolling(hooks) {
  if (polling) return
  polling = true

  const tick = async () => {
    const data = await fetchInstallStatusOnce()
    if (!data) return

    const key = `${data.status}:${data.finished_at || ''}`
    if (data.status === 'succeeded' && lastNotifiedKey !== key) {
      lastNotifiedKey = key
      await hooks.refreshApiHealth?.()
      hooks.setToast?.('Local AI models installed')
    } else if (data.status === 'failed' && lastNotifiedKey !== key) {
      lastNotifiedKey = key
      hooks.setToast?.(data.error || 'Model install failed')
    }

    if (data.status !== 'running') {
      stopPolling()
    }
  }

  tick()
  pollTimer = setInterval(tick, 1500)
}

function stopPolling() {
  polling = false
  if (pollTimer != null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

/**
 * @param {{ compact?: boolean, className?: string }} [props]
 */
export function ModelsInstallPanel({ compact = false, className = '' }) {
  const { refreshApiHealth, setToast, apiAvailable } = useStudio()
  const caps = useStudioStore((s) => s.capabilities)
  const status = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const [fullSet, setFullSet] = useState(false)
  const [starting, setStarting] = useState(false)

  const summary = summarizeMissingModels(caps.models)
  const running = starting || status?.status === 'running'
  const show = Boolean(apiAvailable) && (
    running
    || coreModelsMissing(caps)
    || status?.status === 'failed'
  )

  // One check on API ready — resume poll only if an install is already running.
  useEffect(() => {
    if (!apiAvailable) return undefined
    let cancelled = false
    fetchInstallStatusOnce().then((data) => {
      if (cancelled || !data) return
      if (data.status === 'running') {
        ensurePolling({ refreshApiHealth, setToast })
      }
    })
    return () => { cancelled = true }
  }, [apiAvailable, refreshApiHealth, setToast])

  // Keep polling while this session started / detected a run.
  useEffect(() => {
    if (!running) {
      setStarting(false)
      return
    }
    ensurePolling({ refreshApiHealth, setToast })
  }, [running, refreshApiHealth, setToast])

  if (!show) return null

  const pct = Math.round((Number(status?.progress) || 0) * 100)
  const missingPreview = summary.labels.slice(0, 3).join(', ')
  const more = summary.labels.length > 3 ? ` +${summary.labels.length - 3}` : ''

  const start = async (profile) => {
    setStarting(true)
    lastNotifiedKey = ''
    try {
      const { data } = await apiClient.startModelsInstall({
        profile,
        with_sam3: false,
        install_packages: true,
      })
      setSharedStatus(data)
      setToast?.(
        profile === 'full'
          ? 'Downloading full model set…'
          : 'Downloading essential models (SAM2, DINO, YOLO…)',
      )
      ensurePolling({ refreshApiHealth, setToast })
    } catch (err) {
      setStarting(false)
      setToast?.(err?.message || 'Could not start model install')
    }
  }

  if (compact) {
    return (
      <div className={className}>
        <Button
          variant="accent"
          size="sm"
          disabled={running || !apiAvailable}
          onClick={() => start('recommended')}
          title={missingPreview ? `Missing: ${missingPreview}${more}` : 'Download local AI models'}
        >
          {running
            ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            : <Download className="h-3.5 w-3.5" />}
          {running ? `Models ${pct}%` : 'Download models'}
        </Button>
      </div>
    )
  }

  return (
    <div className={`rounded-lg border border-amber-500/25 bg-amber-500/[.06] px-2.5 py-2 ${className}`}>
      <div className="flex items-start gap-2">
        <HardDriveDownload className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-amber-200/90">
            Local models
          </p>
          <p className="text-[11px] leading-snug text-zinc-400">
            {running
              ? (status?.message || 'Downloading…')
              : summary.missing > 0
                ? `${summary.missing} missing${missingPreview ? `: ${missingPreview}${more}` : ''}`
                : status?.status === 'failed'
                  ? (status.error || 'Install failed')
                  : 'Download SAM2 and other AI weights for offline use.'}
          </p>
          {running ? (
            <div className="h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-amber-400 transition-[width] duration-300"
                style={{ width: `${Math.max(4, pct)}%` }}
              />
            </div>
          ) : null}
          <label className="flex items-center gap-1.5 text-[10px] text-zinc-500">
            <input
              type="checkbox"
              className="rounded border-white/20"
              checked={fullSet}
              disabled={running}
              onChange={(e) => setFullSet(e.target.checked)}
            />
            Full set (larger downloads)
          </label>
          <Button
            variant="accent"
            size="sm"
            full
            disabled={running || !apiAvailable}
            onClick={() => start(fullSet ? 'full' : 'recommended')}
          >
            {running
              ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              : <Download className="h-3.5 w-3.5" />}
            {running ? `Installing… ${pct}%` : 'Download & install'}
          </Button>
        </div>
      </div>
    </div>
  )
}
