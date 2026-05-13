export function getAnalytics() {
  const raw = localStorage.getItem('propai_analytics')
  if (!raw) return { total: 0, avgScore: 0, firstAuditDate: new Date().toISOString() }
  return JSON.parse(raw)
}

export function recordAudit(score) {
  const current = getAnalytics()
  const total = current.total + 1
  const avgScore = (current.avgScore * current.total + score) / total
  const firstAuditDate = current.total === 0 ? new Date().toISOString() : current.firstAuditDate

  localStorage.setItem(
    'propai_analytics',
    JSON.stringify({ total, avgScore: Math.round(avgScore * 10) / 10, firstAuditDate })
  )
}
