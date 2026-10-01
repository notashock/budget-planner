import React from 'react';

/**
 * Animated Brand Logo for Budget Planner.
 * Concept: Dynamic Balance Spline & Pulse Node.
 * Represents deterministic cash balance projection with an active pulse node
 * anchored against the safety floor axis.
 */
export function AnimatedLogo({ size = 24 }) {
  return (
    <div
      className="animated-app-logo"
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: '8px',
        flexShrink: 0
      }}
      title="Budget Planner"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="logo-svg"
      >
        {/* Outer subtle shield/frame */}
        <rect
          x="2"
          y="2"
          width="28"
          height="28"
          rx="7"
          className="logo-frame"
        />

        {/* Safety Floor Axis Line (Dotted baseline) */}
        <line
          x1="5"
          y1="23"
          x2="27"
          y2="23"
          className="logo-floor-line"
        />

        {/* Dynamic Running Balance Spline Curve */}
        <path
          d="M 5 21 C 10 21, 12 10, 17 12 C 22 14, 23 7, 27 9"
          className="logo-spline-curve"
        />

        {/* Outer Glow Halo Ring on Current Day Balance Node */}
        <circle
          cx="17"
          cy="12"
          r="4.5"
          className="logo-pulse-aura"
        />

        {/* Core Solid Balance Node */}
        <circle
          cx="17"
          cy="12"
          r="2.2"
          className="logo-pulse-core"
        />
      </svg>
    </div>
  );
}
