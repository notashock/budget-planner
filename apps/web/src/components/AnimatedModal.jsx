import React, { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

export function AnimatedModal({
  isOpen,
  onClose,
  children,
  maxWidth = '460px',
  dataTestId,
  className = '',
  style = {}
}) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const containerRef = useRef(null);
  const overlayRef = useRef(null);
  const contentRef = useRef(null);
  const isClosingRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      isClosingRef.current = false;
    } else if (shouldRender && !isClosingRef.current) {
      triggerExit();
    }
  }, [isOpen]);

  const triggerExit = (onDone) => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

    gsap.killTweensOf([overlayRef.current, contentRef.current].filter(Boolean));
    const tl = gsap.timeline({
      onComplete: () => {
        setShouldRender(false);
        isClosingRef.current = false;
        if (typeof onDone === 'function') onDone();
        onClose?.();
      }
    });

    if (contentRef.current) {
      tl.to(
        contentRef.current,
        {
          y: isMobile ? '100%' : 16,
          scale: isMobile ? 1 : 0.985,
          opacity: isMobile ? 1 : 0,
          duration: 0.18,
          ease: 'power2.in'
        },
        0
      );
    }
    if (overlayRef.current) {
      tl.to(
        overlayRef.current,
        {
          opacity: 0,
          duration: 0.18,
          ease: 'power2.in'
        },
        0
      );
    }
  };

  useGSAP(
    () => {
      if (!shouldRender || isClosingRef.current) return;
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

      gsap.killTweensOf([overlayRef.current, contentRef.current].filter(Boolean));

      if (overlayRef.current) {
        gsap.fromTo(
          overlayRef.current,
          { opacity: 0 },
          { opacity: 1, duration: 0.24, ease: 'power2.out' }
        );
      }
      if (contentRef.current) {
        gsap.fromTo(
          contentRef.current,
          {
            y: isMobile ? '100%' : 18,
            scale: isMobile ? 1 : 0.985,
            opacity: isMobile ? 1 : 0
          },
          {
            y: 0,
            scale: 1,
            opacity: 1,
            duration: 0.28,
            ease: 'power3.out'
          }
        );
      }
    },
    { dependencies: [shouldRender], scope: containerRef }
  );

  if (!shouldRender) return null;

  return (
    <div ref={containerRef} style={{ position: 'relative', zIndex: 1000 }}>
      <div
        ref={overlayRef}
        className="modal-overlay"
        onClick={() => triggerExit()}
        data-testid={dataTestId}
      >
        <div
          ref={contentRef}
          className={`modal-content ${className}`}
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth, width: '100%', ...style }}
          role="dialog"
          aria-modal="true"
        >
          {typeof children === 'function'
            ? children({ requestClose: (onDone) => triggerExit(onDone) })
            : children}
        </div>
      </div>
    </div>
  );
}
