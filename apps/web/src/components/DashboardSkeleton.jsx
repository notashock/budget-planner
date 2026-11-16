import React from 'react';

/**
 * Authentic Dashboard Skeleton Loading Screen matching the Bento Grid layout.
 * Eliminates layout shift (CLS = 0) and replaces dummy loading text with a smooth,
 * theme-compatible shimmering UI skeleton.
 */
export function DashboardSkeleton() {
  return (
    <div className="dashboard-layout skeleton-dashboard-root" aria-busy="true" aria-label="Loading financial dashboard">
      {/* Top Bento Grid Skeleton */}
      <div className="dashboard-top-grid">
        {/* Left Column: Insights Panel */}
        <div className="dashboard-insights-panel">
          {/* Safe Velocity Hero Skeleton */}
          <div className="summary-card safe-velocity-card skeleton-card">
            <div className="card-top-row" style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="skeleton-box" style={{ width: '90px', height: '14px', borderRadius: '4px' }} />
                <div className="skeleton-box" style={{ width: '65px', height: '18px', borderRadius: '10px' }} />
              </div>
              <div className="skeleton-box" style={{ width: '70px', height: '16px', borderRadius: '10px' }} />
            </div>

            <div style={{ margin: '14px 0 10px' }}>
              <div className="skeleton-box" style={{ width: '160px', height: '36px', borderRadius: '6px' }} />
            </div>

            <div style={{ display: 'flex', gap: '16px', marginTop: '12px' }}>
              <div className="skeleton-box" style={{ width: '110px', height: '12px', borderRadius: '3px' }} />
              <div className="skeleton-box" style={{ width: '120px', height: '12px', borderRadius: '3px' }} />
            </div>
          </div>

          {/* 4 KPI Grid Skeletons */}
          <div className="detailed-kpi-grid summary-grid">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="summary-card kpi-card skeleton-card">
                <div className="kpi-card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <div className="skeleton-box" style={{ width: '22px', height: '22px', borderRadius: '6px' }} />
                    <div className="skeleton-box" style={{ width: '75px', height: '12px', borderRadius: '3px' }} />
                  </div>
                </div>
                <div style={{ margin: '8px 0 4px' }}>
                  <div className="skeleton-box" style={{ width: '100px', height: '22px', borderRadius: '4px' }} />
                </div>
                <div className="skeleton-box" style={{ width: '80px', height: '11px', borderRadius: '3px' }} />
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Chart Panel Skeleton */}
        <div className="dashboard-chart-panel">
          <div className="card chart-card skeleton-card" style={{ height: '100%', minHeight: '365px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div className="skeleton-box" style={{ width: '160px', height: '16px', borderRadius: '4px' }} />
              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="skeleton-box" style={{ width: '60px', height: '14px', borderRadius: '4px' }} />
                <div className="skeleton-box" style={{ width: '90px', height: '14px', borderRadius: '4px' }} />
              </div>
            </div>

            {/* Simulated Chart Wave Lines */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', minHeight: '220px' }}>
              <svg width="100%" height="100%" viewBox="0 0 600 220" preserveAspectRatio="none" style={{ opacity: 0.25 }}>
                <line x1="60" y1="30" x2="580" y2="30" stroke="var(--border)" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="60" y1="110" x2="580" y2="110" stroke="var(--border)" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="60" y1="190" x2="580" y2="190" stroke="var(--border)" strokeWidth="1" />
                <path d="M 60 140 Q 180 50 300 90 T 580 120" fill="none" stroke="var(--primary)" strokeWidth="3" opacity="0.4" />
              </svg>
              <div className="skeleton-shimmer-sweep" />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
              {[1, 5, 10, 15, 20, 25, 30].map((d) => (
                <div key={d} className="skeleton-box" style={{ width: '18px', height: '10px', borderRadius: '2px' }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Timeline Section Skeleton */}
      <div className="dashboard-bottom-timeline" style={{ marginTop: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div className="skeleton-box" style={{ width: '180px', height: '18px', borderRadius: '4px' }} />
          <div className="skeleton-box" style={{ width: '120px', height: '24px', borderRadius: '12px' }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[1, 2, 3].map((row) => (
            <div key={row} className="skeleton-card" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="skeleton-box" style={{ width: '32px', height: '32px', borderRadius: '8px' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div className="skeleton-box" style={{ width: '130px', height: '14px', borderRadius: '3px' }} />
                  <div className="skeleton-box" style={{ width: '80px', height: '10px', borderRadius: '3px' }} />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                <div className="skeleton-box" style={{ width: '70px', height: '16px', borderRadius: '3px' }} />
                <div className="skeleton-box" style={{ width: '50px', height: '10px', borderRadius: '3px' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
