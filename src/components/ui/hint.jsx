import { cn } from '../../lib/cn'

const tones = {
  muted: 'border-white/[.06] bg-black/10 text-zinc-600',
  acid: 'border-acid/10 bg-acid/[.04] text-zinc-500',
  info: 'bg-acid/[.06] text-acid',
  soft: 'bg-black/15 text-zinc-600',
}

export function Hint({ children, tone = 'muted', icon, className }) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3 text-[10px] leading-relaxed',
        tones[tone] || tones.muted,
        !tones[tone]?.includes('border') && 'border-transparent',
        className,
      )}
    >
      {icon}
      {children}
    </div>
  )
}
