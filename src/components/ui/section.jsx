import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/cn'
import { InfoTip } from './info-tip'

/** Shared collapsible section — styles live in `.gs-section*` (index.css). */
export function Section({ title, info, children, open = true, className }) {
  const [expanded, setExpanded] = useState(open)
  const toggle = () => setExpanded((current) => !current)

  return (
    <section className={cn('gs-section', className)}>
      <div className="gs-section-header">
        <button type="button" onClick={toggle} className="gs-section-toggle">
          <span className="gs-label gs-section-title">{title}</span>
        </button>
        {info && <InfoTip side="bottom">{info}</InfoTip>}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          aria-label={`Toggle ${title}`}
          className="gs-section-chevron-btn"
        >
          <ChevronDown className={cn('gs-section-chevron', expanded && 'is-open')} />
        </button>
      </div>
      {expanded && <div className="gs-section-body">{children}</div>}
    </section>
  )
}
