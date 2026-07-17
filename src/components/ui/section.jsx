import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/cn'
import { InfoTip } from './info-tip'

/**
 * Shared collapsible used by side-panel sections and the effect timeline.
 * Styles: `.gs-section*` in index.css
 */
export function Collapsible({
  title,
  info,
  meta,
  children,
  open = true,
  className,
  bodyClassName,
}) {
  const [expanded, setExpanded] = useState(open)
  const toggle = () => setExpanded((current) => !current)

  return (
    <section className={cn('gs-section', className)}>
      <div className="gs-section-header">
        <button type="button" onClick={toggle} className="gs-section-toggle">
          <span className="gs-section-title">{title}</span>
        </button>
        {info && <InfoTip side="bottom">{info}</InfoTip>}
        {meta && <div className="gs-section-meta">{meta}</div>}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          aria-label={`Toggle ${typeof title === 'string' ? title : 'section'}`}
          className="gs-section-chevron-btn"
        >
          <ChevronDown className={cn('gs-section-chevron', expanded && 'is-open')} />
        </button>
      </div>
      {expanded && <div className={cn('gs-section-body', bodyClassName)}>{children}</div>}
    </section>
  )
}

/** Side-panel section — same collapsible logic as the timeline. */
export function Section(props) {
  return <Collapsible {...props} />
}
