// Thin client for the workspace sidecar (server/index.js), proxied at /ws in dev.

const BASE = '/ws'

async function call(path, options) {
  const res = await fetch(`${BASE}${path}`, options)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`)
  return data
}

const post = (path, body) =>
  call(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

export const health = () => call('/health')
export const attach = (path) => post('/workspace', { path })
/** Opens the native folder dialog; resolves { canceled: true } if dismissed. */
export const pickFolder = () => post('/pick')
export const detach = () => post('/detach')
export const getTree = () => call('/tree')
export const readFile = (path) => call(`/file?path=${encodeURIComponent(path)}`)
export const writeFile = (path, content) => post('/write', { path, content })
export const deletePath = (path) => post('/delete', { path })
export const search = (query) => post('/search', { query })

/** Streams an approved command's output; onEvent gets {type:'out'|'err'|'exit'}. */
export async function exec(command, onEvent, signal) {
  const res = await fetch(`${BASE}/exec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command }),
    signal,
  })
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `${res.status} ${res.statusText}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let exitCode = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      const line = frame.trim()
      if (!line.startsWith('data:')) continue
      const event = JSON.parse(line.slice(5).trim())
      if (event.type === 'exit') exitCode = event.code
      onEvent(event)
    }
  }
  return exitCode
}
