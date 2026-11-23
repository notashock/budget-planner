import React, { useEffect, useRef, useState } from 'react';

/**
 * One header for every screen: a large title that hands over to a compact, blurred
 * bar under the toolbar once it scrolls out of view. `actions` sit beside the title.
 */
export function ScreenHeader({ title, actions = null, className = '' }) {
  const titleRef = useRef(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const el = titleRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const toolbarHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--toolbar-h'), 10) || 0;
    const observer = new IntersectionObserver(
      ([entry]) => setCompact(!entry.isIntersecting && entry.boundingClientRect.top < toolbarHeight),
      { rootMargin: `-${toolbarHeight}px 0px 0px 0px` },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`screen-header ${className}`.trim()}>
      <h1 ref={titleRef} className="page-title">{title}</h1>
      {actions && <div className="screen-header-actions">{actions}</div>}
      <div className={`screen-header-compact${compact ? ' is-visible' : ''}`} aria-hidden="true">
        {title}
      </div>
    </div>
  );
}
