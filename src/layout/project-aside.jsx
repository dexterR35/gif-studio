import { Outlet } from 'react-router-dom'
import { FileImage, FolderOpen, ImagePlus, X } from 'lucide-react'
import { useStudio } from '../context/studio-provider'
import { cn } from '../lib/cn'

const TAB_TITLES = {
  ai: 'AI',
  motion: 'Motion',
  edit: 'Effects',
  text: 'Text',
}

export function ProjectAside() {
  const {
    mobilePanel, setMobilePanel, fileRef, dropActive, setDropActive,
    loadFile, source, activeTab,
  } = useStudio()

  const canReplace = activeTab === 'ai' || activeTab === 'motion'
  const hasSource = Boolean(source?.url)
  const tabTitle = TAB_TITLES[activeTab] || 'Project'

  const empty = (
    <>
      <div className="relative mb-2 flex aspect-[1.55] flex-col items-center justify-center gap-2 overflow-hidden rounded-[10px] bg-surface">
        <ImagePlus className="h-7 w-7 text-zinc-600" />
        <span className="text-[11px] font-medium text-zinc-500">Drop or open a source</span>
      </div>
      <div className="flex items-start gap-2">
        <FileImage className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-600" />
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium text-zinc-400">No image selected</p>
          <p className="mt-0.5 text-[10px] text-zinc-600">PNG, JPG, or GIF</p>
        </div>
      </div>
    </>
  )

  const preview = hasSource ? (
    <>
      <div className="relative mb-2 aspect-[1.55] overflow-hidden rounded-[10px] bg-surface checker">
        <img src={source.url} alt="Source" className="h-full w-full object-contain" />
        {canReplace && (
          <div className="absolute inset-0 grid place-items-center bg-black/55 opacity-0 transition group-hover:opacity-100">
            <span className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-bold text-black">
              <FolderOpen className="h-3.5 w-3.5" /> Replace
            </span>
          </div>
        )}
      </div>
      <div className="flex items-start gap-2">
        <FileImage className="mt-0.5 h-3.5 w-3.5 shrink-0 text-acid" />
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium text-zinc-200">{source.name}</p>
          <p className="mt-0.5 text-[10px] text-zinc-600">
            {source.width} × {source.height} px
            {source.frameCount > 1 ? ` · ${source.frameCount} frames` : ''}
          </p>
        </div>
      </div>
    </>
  ) : empty

  return (
    <aside
      className={`scrollbar absolute inset-y-0 left-0 z-20 h-full w-[286px] overflow-y-auto overscroll-contain border-r border-white/[.06] bg-panel px-3.5 transition-transform lg:relative lg:inset-auto lg:shrink-0 lg:translate-x-0 ${mobilePanel ? 'translate-x-0' : '-translate-x-full'}`}
    >
      <div className="flex h-11 items-center justify-between border-b border-white/[.06]">
        <span className="text-[10px] font-semibold uppercase tracking-[.14em] text-zinc-500">{tabTitle}</span>
        <button type="button" onClick={() => setMobilePanel(false)} className="lg:hidden">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="py-3">
        {canReplace ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDropActive(true) }}
            onDragLeave={() => setDropActive(false)}
            onDrop={(e) => { e.preventDefault(); setDropActive(false); loadFile(e.dataTransfer.files[0]) }}
            className={cn(
              'focus-ring group w-full rounded-[12px] border border-dashed p-2.5 text-left transition',
              dropActive ? 'border-acid bg-acid/5' : 'border-white/[.12] hover:border-white/25',
            )}
          >
            {preview}
          </button>
        ) : (
          <div className="w-full rounded-[12px] border border-white/[.08] p-2.5">
            {preview}
          </div>
        )}
        <input
          ref={fileRef}
          className="hidden"
          type="file"
          accept="image/png,image/jpeg,image/gif,video/mp4,video/webm,.png,.jpg,.jpeg,.gif,.mp4,.webm"
          onChange={(e) => loadFile(e.target.files[0])}
        />
      </div>

      <Outlet />
    </aside>
  )
}
