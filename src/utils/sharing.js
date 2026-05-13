export function shareResult(result) {
  const json = JSON.stringify(result)
  const encoded = btoa(unescape(encodeURIComponent(json)))
  const url = `${window.location.origin}${window.location.pathname}?r=${encoded}`
  navigator.clipboard.writeText(url).catch(() => {})
  return url
}

export function loadSharedResult() {
  const params = new URLSearchParams(window.location.search)
  const encoded = params.get('r')
  if (!encoded) return null
  try {
    const json = decodeURIComponent(escape(atob(encoded)))
    return JSON.parse(json)
  } catch {
    return null
  }
}
