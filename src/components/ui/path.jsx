import { cn } from '../../lib/cn'

/** SVG path / polygon overlay for canvas selection tools. */
export function SelectionPath({
  points = [],
  tool = 'Polygonal Lasso',
  smoothPath,
  className,
}) {
  if (!points.length) return null

  return (
    <svg
      className={cn('pointer-events-none absolute inset-0 h-full w-full', className)}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      {tool === 'Pen Path' && points.length >= 3 && smoothPath ? (
        <path
          d={smoothPath(points)}
          fill="rgb(var(--primary_accent-rgb) / 0.12)"
          stroke="var(--primary_accent)"
          strokeWidth=".45"
          strokeDasharray="1.2 1"
        />
      ) : (
        <polygon
          points={points.map((point) => `${point.x * 100},${point.y * 100}`).join(' ')}
          fill="rgb(var(--primary_accent-rgb) / 0.12)"
          stroke="var(--primary_accent)"
          strokeWidth=".45"
          strokeDasharray="1.2 1"
        />
      )}
      {(tool === 'Polygonal Lasso' || tool === 'Pen Path') &&
        points.map((point, index) => (
          <circle
            key={index}
            cx={point.x * 100}
            cy={point.y * 100}
            r=".8"
            fill="#111113"
            stroke="var(--primary_accent)"
            strokeWidth=".35"
          />
        ))}
    </svg>
  )
}

export function StageHint({ children, className }) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-lg bg-black/75 px-3 py-2 text-[10px] font-semibold text-white shadow-xl',
        className,
      )}
    >
      {children}
    </div>
  )
}
