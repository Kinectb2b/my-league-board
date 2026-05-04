export function SkeletonBlock({ width, height = '1rem', style }) {
  return <div className="skeleton" style={{ width, height, borderRadius: 'var(--radius)', ...style }} />
}

export function SkeletonList({ rows = 5, rowHeight = '2.5rem', gap = '0.5rem', style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap, ...style }} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBlock key={i} height={rowHeight} />
      ))}
    </div>
  )
}

export function SkeletonPage({ headerWidth = '180px', rows = 6, rowHeight = '2.5rem' }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      <SkeletonBlock height="2rem" width={headerWidth} style={{ marginBottom: '1.5rem' }} />
      <SkeletonList rows={rows} rowHeight={rowHeight} />
    </div>
  )
}

export function SkeletonPageShell() {
  return (
    <div className="app-layout" aria-busy="true" aria-label="Loading">
      <aside className="sidebar" aria-hidden="true">
        <div style={{ padding: '1.5rem 1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <div className="skeleton" style={{ width: '32px', height: '32px', borderRadius: '12px' }} />
            <div className="skeleton" style={{ width: '120px', height: '1rem', borderRadius: 'var(--radius)' }} />
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: '2rem', marginBottom: '0.5rem', borderRadius: 'var(--radius)' }} />
          ))}
        </div>
      </aside>
      <main className="main-content">
        <SkeletonPage />
      </main>
    </div>
  )
}
