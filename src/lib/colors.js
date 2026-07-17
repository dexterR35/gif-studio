/** Design tokens — keep in sync with Tailwind theme + CSS variables. */
export const colors = {
  acid: '#d8ff3e',
  acidHover: '#e2ff6a',
  ink: '#0d0d0f',
  panel: '#171719',
  stage: '#111113',
  surface: '#101012',
  text: '#f5f5f2',
  muted: '#71717a',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.13)',
  success: '#34d399',
  warning: '#fbbf24',
  danger: '#f87171',
}

export const statusTone = {
  success: {
    wrap: 'bg-emerald-500/10 text-emerald-400',
    dot: 'bg-emerald-400',
  },
  warning: {
    wrap: 'bg-amber-500/10 text-amber-300',
    dot: 'bg-amber-300',
  },
  danger: {
    wrap: 'bg-red-500/10 text-red-400',
    dot: 'bg-red-400',
  },
  neutral: {
    wrap: 'bg-white/5 text-zinc-400',
    dot: 'bg-zinc-500',
  },
}
