/** Keep in sync with --primary_accent / --primary_accent-rgb in index.css */
export const PRIMARY_ACCENT = '#d8ff3e'

/** Status badge tones used by StatusBadge. */
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
