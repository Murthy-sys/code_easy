// Talks to a local model runtime. Two dialects are supported:
//   'ollama' -> POST /api/chat        (newline-delimited JSON stream)
//   'openai' -> POST /v1/chat/completions  (SSE stream) — LM Studio, llama.cpp, vLLM
//
// baseUrl defaults to '/llm', which the Vite dev server proxies (see vite.config.js).

const join = (base, path) => `${base.replace(/\/+$/, '')}${path}`

export async function listModels(baseUrl, dialect) {
  if (dialect === 'ollama') {
    const res = await fetch(join(baseUrl, '/api/tags'))
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    const data = await res.json()
    return (data.models ?? []).map((m) => m.name)
  }

  const res = await fetch(join(baseUrl, '/v1/models'))
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  const data = await res.json()
  return (data.data ?? []).map((m) => m.id)
}

/**
 * Streams a completion, invoking onToken with each text delta.
 * Returns { content, toolCalls } once the stream ends.
 */
export async function streamChat({
  baseUrl,
  dialect,
  model,
  messages,
  temperature,
  tools,
  signal,
  onToken,
}) {
  const url =
    dialect === 'ollama'
      ? join(baseUrl, '/api/chat')
      : join(baseUrl, '/v1/chat/completions')

  const body =
    dialect === 'ollama'
      ? { model, messages, stream: true, options: { temperature } }
      : { model, messages, stream: true, temperature }

  if (tools?.length) body.tools = tools

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '')
    throw new Error(detail.trim() || `${res.status} ${res.statusText}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''

  // Keyed by the call's stream index. OpenAI fragments arguments across chunks;
  // MLX sends each call whole. Accumulating handles both.
  const calls = new Map()

  const emitText = (chunk) => {
    if (!chunk) return
    content += chunk
    onToken?.(chunk)
  }

  const emitCalls = (toolCalls) => {
    if (!toolCalls) return
    toolCalls.forEach((call, i) => {
      const key = call.index ?? i
      const existing = calls.get(key) ?? { id: '', name: '', arguments: '' }
      calls.set(key, {
        id: call.id || existing.id || `call_${key}`,
        name: call.function?.name || existing.name,
        arguments: existing.arguments + (call.function?.arguments ?? ''),
      })
    })
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? '' // keep the trailing partial line

    for (const raw of lines) {
      const line = raw.trim()
      if (!line) continue

      if (dialect === 'ollama') {
        try {
          const msg = JSON.parse(line).message
          emitText(msg?.content)
          emitCalls(msg?.tool_calls)
        } catch {
          /* runtimes occasionally emit keep-alive noise */
        }
        continue
      }

      if (!line.startsWith('data:')) continue // skips SSE comments like ": keepalive"
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') continue
      try {
        const delta = JSON.parse(payload).choices?.[0]?.delta
        emitText(delta?.content)
        emitCalls(delta?.tool_calls)
      } catch {
        /* ignore malformed SSE frames */
      }
    }
  }

  return { content, toolCalls: [...calls.values()].filter((c) => c.name) }
}
