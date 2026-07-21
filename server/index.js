// Workspace sidecar: gives the browser scoped access to one project folder.
//
// Every filesystem path is resolved against the attached root and rejected if it
// escapes — the browser is untrusted here, and so is the model driving it.

import express from 'express'
import cors from 'cors'
import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const PORT = Number(process.env.WORKSPACE_PORT ?? 8787)
const MAX_READ_BYTES = 512 * 1024
const EXEC_TIMEOUT_MS = 120_000

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.venv', 'venv',
  '__pycache__', '.cache', 'target', '.DS_Store',
])

const app = express()
app.use(cors())
app.use(express.json({ limit: '12mb' }))

/** The currently attached project root; null until the user attaches one. */
let root = null

const expandHome = (p) =>
  p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p

/** Resolve a workspace-relative path, refusing anything outside the root. */
function resolveInRoot(relPath) {
  if (!root) throw new HttpError(409, 'No workspace attached')
  const target = path.resolve(root, relPath ?? '.')
  const rel = path.relative(root, target)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new HttpError(403, `Path escapes the workspace: ${relPath}`)
  }
  return target
}

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res)
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message })
  }
}

app.get('/health', (req, res) => res.json({ ok: true, root }))

app.post(
  '/workspace',
  handle(async (req, res) => {
    const dir = path.resolve(expandHome(String(req.body.path ?? '').trim()))
    const stat = await fs.stat(dir).catch(() => null)
    if (!stat?.isDirectory()) throw new HttpError(400, `Not a directory: ${dir}`)
    root = dir
    res.json({ root, name: path.basename(dir) })
  }),
)

/**
 * Opens the OS folder picker and returns what the user chose.
 * The browser can't do this itself — showDirectoryPicker() hands back a sandboxed
 * handle, not the absolute path the sidecar needs.
 */
app.post(
  '/pick',
  handle(async (req, res) => {
    if (process.platform !== 'darwin') {
      throw new HttpError(501, 'Folder picker is macOS-only; paste a path instead')
    }

    const chosen = await new Promise((resolve, reject) => {
      execFile(
        'osascript',
        [
          // Bring the dialog to the front — otherwise it can open behind the browser.
          '-e', 'tell application "System Events" to activate',
          '-e', 'POSIX path of (choose folder with prompt "Choose a project folder")',
        ],
        (err, stdout, stderr) => {
          if (err) {
            // Cancelling — or the dialog being killed — is a normal outcome.
            if (err.killed || /User canceled|-128/.test(stderr)) return resolve(null)
            return reject(new HttpError(500, stderr.trim() || err.message))
          }
          resolve(stdout.trim())
        },
      )
    })

    if (!chosen) return res.json({ canceled: true })

    // osascript returns a trailing slash; path.resolve drops it.
    root = path.resolve(chosen)
    res.json({ root, name: path.basename(root) })
  }),
)

app.post('/detach', (req, res) => {
  root = null
  res.json({ ok: true })
})

/** Recursive listing, depth-capped so huge trees don't stall the UI. */
async function walk(dir, depth = 0) {
  if (depth > 6) return []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const out = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push({
        name: entry.name,
        path: path.relative(root, full),
        type: 'dir',
        children: await walk(full, depth + 1),
      })
    } else if (entry.isFile()) {
      out.push({ name: entry.name, path: path.relative(root, full), type: 'file' })
    }
  }
  return out
}

app.get(
  '/tree',
  handle(async (req, res) => {
    resolveInRoot('.')
    res.json({ root, name: path.basename(root), tree: await walk(root) })
  }),
)

app.get(
  '/file',
  handle(async (req, res) => {
    const target = resolveInRoot(req.query.path)
    const stat = await fs.stat(target)
    if (stat.size > MAX_READ_BYTES) {
      throw new HttpError(413, `File is ${Math.round(stat.size / 1024)}KB; too large to read`)
    }
    res.json({ path: req.query.path, content: await fs.readFile(target, 'utf8') })
  }),
)

app.post(
  '/write',
  handle(async (req, res) => {
    const target = resolveInRoot(req.body.path)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, String(req.body.content ?? ''), 'utf8')
    res.json({ ok: true, path: req.body.path })
  }),
)

app.post(
  '/delete',
  handle(async (req, res) => {
    await fs.rm(resolveInRoot(req.body.path), { recursive: true, force: true })
    res.json({ ok: true })
  }),
)

/** Literal substring search; good enough for a project-sized tree. */
app.post(
  '/search',
  handle(async (req, res) => {
    const query = String(req.body.query ?? '')
    if (!query) throw new HttpError(400, 'Empty query')
    resolveInRoot('.')

    const hits = []
    const scan = async (dir, depth = 0) => {
      if (depth > 6 || hits.length >= 60) return
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          await scan(full, depth + 1)
        } else if (entry.isFile()) {
          const stat = await fs.stat(full)
          if (stat.size > MAX_READ_BYTES) continue
          const text = await fs.readFile(full, 'utf8').catch(() => null)
          if (text == null) continue
          text.split('\n').forEach((line, i) => {
            if (hits.length < 60 && line.includes(query)) {
              hits.push({ path: path.relative(root, full), line: i + 1, text: line.trim().slice(0, 200) })
            }
          })
        }
      }
    }
    await scan(root)
    res.json({ hits })
  }),
)

/** Runs an approved command inside the workspace, streaming output as SSE. */
app.post(
  '/exec',
  handle(async (req, res) => {
    resolveInRoot('.')
    const command = String(req.body.command ?? '').trim()
    if (!command) throw new HttpError(400, 'Empty command')

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.flushHeaders()

    const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`)
    const child = spawn(command, { cwd: root, shell: true })
    const timer = setTimeout(() => child.kill('SIGKILL'), EXEC_TIMEOUT_MS)

    child.stdout.on('data', (d) => send({ type: 'out', text: d.toString() }))
    child.stderr.on('data', (d) => send({ type: 'err', text: d.toString() }))
    child.on('error', (e) => send({ type: 'err', text: e.message }))
    child.on('close', (code) => {
      clearTimeout(timer)
      send({ type: 'exit', code })
      res.end()
    })

    // Watch the *response*: req emits 'close' as soon as its body is consumed,
    // which would kill the child before it ever ran.
    res.on('close', () => {
      clearTimeout(timer)
      child.kill('SIGKILL')
    })
  }),
)

app.listen(PORT, '127.0.0.1', () => {
  console.log(`workspace sidecar on http://127.0.0.1:${PORT}`)
})
