import gsap from 'gsap';

/**
 * Fade-and-rise entrance for a group of cards. The cards are visible at rest:
 * the animation is skipped when the user prefers reduced motion or the tab is
 * hidden (no frames would run, leaving the cards at opacity 0), and it jumps to
 * the end if the tab is hidden part-way through.
 *
 * Returns a cleanup function for useGSAP / useEffect.
 */
export function playEntrance(targets, { y = 8, duration = 0.25, stagger = 0.04 } = {}) {
  if (!targets || targets.length === 0) return undefined;
  if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
  if (document.hidden) return undefined;

  const tween = gsap.fromTo(
    targets,
    { opacity: 0, y },
    { opacity: 1, y: 0, duration, stagger, ease: 'power2.out', clearProps: 'opacity,transform' }
  );
  const finish = () => { if (document.hidden) tween.progress(1); };
  document.addEventListener('visibilitychange', finish);
  return () => document.removeEventListener('visibilitychange', finish);
}
