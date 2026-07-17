import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/cn'
import { InfoTip } from './info-tip'

/** Shared collapsible section — styles live in `.gs-section*` (index.css). */
export function Section({ title, info, children, open = true, className }) {
  const [expanded, setExpanded] = useState(open)

  return (
    <section className={cn('gs-section', className)}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="gs-section-header"
      >
        <span className="gs-label gs-section-title">
          {title}
          {info && <InfoTip side="bottom">{info}</InfoTip>}
        </span>
        <ChevronDown className={cn('gs-section-chevron', expanded && 'is-open')} />
      </button>
      {expanded && <div className="gs-section-body">{children}</div>}
    </section>
  )
}
