// Tool schemas sent to the model, plus the executor that runs them.
//
// Read-only tools run immediately. Anything that mutates the project or runs a
// command is gated: the executor asks the UI for approval and waits.

import * as ws from './workspace'

const fn = (name, description, properties, required) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } },
})

export const TOOLS = [
  fn(
    'list_files',
    'List files and folders in the project. Call this first to orient yourself.',
    { path: { type: 'string', description: 'Folder relative to project root. Use "." for the root.' } },
    ['path'],
  ),
  fn(
    'read_file',
    'Read a file\'s full contents. Always read a file before editing it.',
    { path: { type: 'string', description: 'File path relative to project root.' } },
    ['path'],
  ),
  fn(
    'search',
    'Search the project for a literal string. Returns matching file paths and line numbers.',
    { query: { type: 'string', description: 'Exact text to find.' } },
    ['query'],
  ),
  fn(
    'edit_file',
    'Replace an exact snippet in an existing file. Prefer this over write_file for changes to large files. old_text must match the file exactly and appear only once.',
    {
      path: { type: 'string', description: 'File path relative to project root.' },
      old_text: { type: 'string', description: 'Exact text to replace, including indentation.' },
      new_text: { type: 'string', description: 'Replacement text.' },
    },
    ['path', 'old_text', 'new_text'],
  ),
  fn(
    'write_file',
    'Create a new file or overwrite an existing one with full contents.',
    {
      path: { type: 'string', description: 'File path relative to project root.' },
      content: { type: 'string', description: 'Complete file contents.' },
    },
    ['path', 'content'],
  ),
  fn(
    'delete_file',
    'Delete a file or folder from the project.',
    { path: { type: 'string', description: 'Path relative to project root.' } },
    ['path'],
  ),
  fn(
    'run_command',
    'Run a shell command in the project root, e.g. "npm test" or "git diff". Returns stdout, stderr and the exit code.',
    { command: { type: 'string', description: 'The command line to run.' } },
    ['command'],
  ),
]

export const NEEDS_APPROVAL = new Set(['edit_file', 'write_file', 'delete_file', 'run_command'])

export const SYSTEM_PROMPT = `You are a coding agent working inside the user's project via tools.

Rules:
- Explore before you act: list_files and read_file to understand the code, and read a file before you edit it.
- Never invent file paths or contents. If you have not read it, read it.
- Prefer edit_file for targeted changes; use write_file for new files or full rewrites.
- Make the smallest change that satisfies the request, and match the surrounding code's style.
- Edits and commands require the user's approval. If one is rejected, stop and ask what they'd prefer instead — do not retry the same thing.
- When you are done, summarise what changed in a sentence or two. Do not repeat whole files back to the user.`

/**
 * Runs one tool call.
 * @param requestApproval async (call, preview) => boolean — resolves when the user decides.
 * @param onExecOutput   (text) => void — live command output for the UI.
 * @returns a string to hand back to the model as the tool result.
 */
export async function executeTool(call, { requestApproval, onExecOutput }) {
  const { name } = call
  let args
  try {
    args = typeof call.arguments === 'string' ? JSON.parse(call.arguments || '{}') : call.arguments
  } catch {
    return `Error: could not parse arguments for ${name}. Send valid JSON.`
  }

  try {
    switch (name) {
      case 'list_files': {
        const { tree } = await ws.getTree()
        return renderTree(pickSubtree(tree, args.path)) || '(empty)'
      }

      case 'read_file': {
        const { content } = await ws.readFile(args.path)
        return content || '(empty file)'
      }

      case 'search': {
        const { hits } = await ws.search(args.query)
        if (!hits.length) return `No matches for "${args.query}".`
        return hits.map((h) => `${h.path}:${h.line}: ${h.text}`).join('\n')
      }

      case 'edit_file': {
        const { content } = await ws.readFile(args.path)
        const occurrences = content.split(args.old_text).length - 1
        if (occurrences === 0) return `Error: old_text not found in ${args.path}. Read the file again and match it exactly.`
        if (occurrences > 1) return `Error: old_text appears ${occurrences} times in ${args.path}. Include more surrounding context to make it unique.`

        const updated = content.replace(args.old_text, args.new_text)
        const approved = await requestApproval(call, {
          kind: 'diff',
          path: args.path,
          before: content,
          after: updated,
        })
        if (!approved) return `The user rejected this edit to ${args.path}.`
        await ws.writeFile(args.path, updated)
        return `Applied the edit to ${args.path}.`
      }

      case 'write_file': {
        // May not exist yet — an empty "before" makes the diff read as a creation.
        const before = await ws.readFile(args.path).then((r) => r.content).catch(() => '')
        const approved = await requestApproval(call, {
          kind: 'diff',
          path: args.path,
          before,
          after: args.content,
          isNew: !before,
        })
        if (!approved) return `The user rejected writing ${args.path}.`
        await ws.writeFile(args.path, args.content)
        return `Wrote ${args.path}.`
      }

      case 'delete_file': {
        const approved = await requestApproval(call, { kind: 'delete', path: args.path })
        if (!approved) return `The user rejected deleting ${args.path}.`
        await ws.deletePath(args.path)
        return `Deleted ${args.path}.`
      }

      case 'run_command': {
        const approved = await requestApproval(call, { kind: 'command', command: args.command })
        if (!approved) return `The user rejected running: ${args.command}`

        let output = ''
        const code = await ws.exec(args.command, (event) => {
          if (event.type === 'out' || event.type === 'err') {
            output += event.text
            onExecOutput?.(event.text)
          }
        })
        const trimmed = output.length > 12_000 ? `${output.slice(-12_000)}\n…(truncated)` : output
        return `Exit code: ${code}\n\n${trimmed || '(no output)'}`
      }

      default:
        return `Error: unknown tool "${name}".`
    }
  } catch (err) {
    return `Error running ${name}: ${err.message}`
  }
}

/** Narrow a full tree to the requested folder. */
function pickSubtree(tree, target) {
  const clean = (target ?? '.').replace(/^\.\/|\/$/g, '')
  if (!clean || clean === '.') return tree

  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.path === clean) return node.children ?? []
      if (node.type === 'dir') {
        const found = walk(node.children ?? [])
        if (found) return found
      }
    }
    return null
  }
  return walk(tree) ?? tree
}

function renderTree(nodes, indent = '') {
  return nodes
    .map((node) => {
      const line = `${indent}${node.name}${node.type === 'dir' ? '/' : ''}`
      const children = node.type === 'dir' ? renderTree(node.children ?? [], `${indent}  `) : ''
      return children ? `${line}\n${children}` : line
    })
    .join('\n')
}
