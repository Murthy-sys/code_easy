// The agentic turn: stream a reply, run whatever tools the model asked for, feed
// the results back, repeat until it answers in plain text or hits the step cap.

import { streamChat } from './llm'
import { SYSTEM_PROMPT, TOOLS, executeTool } from './tools'

const MAX_STEPS = 12

/** Transcript entries -> the message shape the API expects. */
export function toApiMessages(entries, systemPrompt) {
  const messages = systemPrompt ? [{ role: 'system', content: systemPrompt }] : []

  for (const entry of entries) {
    if (entry.role === 'user') {
      messages.push({ role: 'user', content: entry.content })
    } else if (entry.role === 'assistant') {
      const message = { role: 'assistant', content: entry.content ?? '' }
      if (entry.toolCalls?.length) {
        message.tool_calls = entry.toolCalls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: c.arguments },
        }))
      }
      messages.push(message)
    } else if (entry.role === 'tool') {
      messages.push({
        role: 'tool',
        tool_call_id: entry.toolCallId,
        name: entry.name,
        content: entry.result ?? '',
      })
    }
  }
  return messages
}

/**
 * @param entries    transcript so far, ending with the new user message
 * @param append     (entry) => void   — add a transcript entry
 * @param update     (id, patch) => void — patch one by id
 * @param newId      () => string
 */
export async function runAgent({
  settings,
  entries,
  agentMode,
  signal,
  append,
  update,
  newId,
  requestApproval,
}) {
  const systemPrompt = agentMode ? SYSTEM_PROMPT : settings.systemPrompt
  const working = [...entries]

  for (let step = 0; step < MAX_STEPS; step++) {
    const assistantId = newId()
    append({ id: assistantId, role: 'assistant', content: '' })

    const { content, toolCalls } = await streamChat({
      baseUrl: settings.baseUrl,
      dialect: settings.dialect,
      model: settings.model,
      temperature: settings.temperature,
      tools: agentMode ? TOOLS : undefined,
      signal,
      messages: toApiMessages(working, systemPrompt),
      onToken: (delta) => update(assistantId, (m) => ({ content: m.content + delta })),
    })

    const assistantEntry = { id: assistantId, role: 'assistant', content, toolCalls }
    update(assistantId, () => ({ content, toolCalls }))
    working.push(assistantEntry)

    if (!toolCalls.length) return

    for (const call of toolCalls) {
      if (signal.aborted) return

      const toolId = newId()
      append({
        id: toolId,
        role: 'tool',
        toolCallId: call.id,
        name: call.name,
        arguments: call.arguments,
        status: 'running',
        result: '',
        output: '',
      })

      const result = await executeTool(call, {
        requestApproval: (c, preview) => {
          update(toolId, () => ({ status: 'awaiting', preview }))
          return requestApproval(c, preview).then((approved) => {
            update(toolId, () => ({ status: approved ? 'running' : 'rejected' }))
            return approved
          })
        },
        onExecOutput: (text) => update(toolId, (m) => ({ output: m.output + text })),
      })

      const rejected = result.startsWith('The user rejected')
      const failed = result.startsWith('Error')
      update(toolId, () => ({
        status: rejected ? 'rejected' : failed ? 'failed' : 'done',
        result,
      }))

      working.push({
        id: toolId,
        role: 'tool',
        toolCallId: call.id,
        name: call.name,
        result,
      })
    }
  }

  append({
    id: newId(),
    role: 'assistant',
    content: `_Stopped after ${MAX_STEPS} tool steps. Ask me to continue if it needs more._`,
  })
}
