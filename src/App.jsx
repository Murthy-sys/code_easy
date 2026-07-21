import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Sidebar from './components/Sidebar'
import Settings from './components/Settings'
import Composer from './components/Composer'
import Markdown from './components/Markdown'
import Workspace from './components/Workspace'
import ToolCard from './components/ToolCard'
import { runAgent } from './lib/agent'
import * as ws from './lib/workspace'
import {
  loadChats,
  loadRecents,
  loadSettings,
  newChat,
  rememberFolder,
  saveChats,
  saveSettings,
  titleFrom,
} from './lib/store'
import './App.css'

const SUGGESTIONS = [
  'Explain how attention works, with a small example',
  'Write a Python script that renames files by date taken',
  'Give me a 3-day plan to learn Rust',
  'Summarize the trade-offs between SQLite and Postgres',
]

const AGENT_SUGGESTIONS = [
  'Give me a tour of this codebase',
  'Find any TODO comments and list what they need',
  'Add a README section explaining how to run the tests',
  'Look for bugs in the error handling',
]

export default function App() {
  const [chats, setChats] = useState(loadChats)
  const [activeId, setActiveId] = useState(() => loadChats()[0]?.id ?? null)
  const [settings, setSettings] = useState(loadSettings)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const [workspace, setWorkspace] = useState(null)
  const [wsError, setWsError] = useState('')
  const [showFiles, setShowFiles] = useState(true)
  const [viewFile, setViewFile] = useState(null)
  const [pending, setPending] = useState(null) // { resolve } while awaiting approval
  const [recents, setRecents] = useState(loadRecents)
  const [picking, setPicking] = useState(false)

  const abortRef = useRef(null)
  const bottomRef = useRef(null)

  const active = useMemo(() => chats.find((c) => c.id === activeId) ?? null, [chats, activeId])
  const agentMode = Boolean(workspace)

  useEffect(() => saveChats(chats), [chats])
  useEffect(() => saveSettings(settings), [settings])
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
  }, [settings.theme])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [active?.messages, busy])

  const refreshTree = useCallback(async () => {
    const data = await ws.getTree()
    setWorkspace({ root: data.root, name: data.name, tree: data.tree })
    return data
  }, [])

  const sidecarError = (err) =>
    err.message.includes('Failed to fetch')
      ? 'Workspace server is not running — start it with `npm run dev`.'
      : err.message

  // The sidecar keeps the attached folder in memory, so reconnect on reload.
  useEffect(() => {
    ws.health()
      .then((h) => (h.root ? refreshTree() : null))
      .catch(() => {
        /* sidecar not running — the workspace panel explains how to start it */
      })
  }, [refreshTree])

  const attachWorkspace = async (path) => {
    setWsError('')
    try {
      await ws.attach(path)
      const data = await refreshTree()
      setRecents(rememberFolder(data.root))
    } catch (err) {
      setWsError(sidecarError(err))
    }
  }

  /** Opens the native Finder dialog via the sidecar. */
  const browseForFolder = async () => {
    setWsError('')
    setPicking(true)
    try {
      const picked = await ws.pickFolder()
      if (picked.canceled) return
      const data = await refreshTree()
      setRecents(rememberFolder(data.root))
    } catch (err) {
      setWsError(sidecarError(err))
    } finally {
      setPicking(false)
    }
  }

  const detachWorkspace = async () => {
    await ws.detach().catch(() => {})
    setWorkspace(null)
  }

  const openFile = async (path) => {
    try {
      const { content } = await ws.readFile(path)
      setViewFile({ path, content })
    } catch (err) {
      setWsError(err.message)
    }
  }

  const startNewChat = useCallback(() => {
    const chat = newChat()
    setChats((prev) => [chat, ...prev])
    setActiveId(chat.id)
    setSidebarOpen(false)
    return chat
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        startNewChat()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [startNewChat])

  const patchChat = (id, fn) => setChats((prev) => prev.map((c) => (c.id === id ? fn(c) : c)))

  const deleteChat = (id) => {
    setChats((prev) => {
      const next = prev.filter((c) => c.id !== id)
      if (id === activeId) setActiveId(next[0]?.id ?? null)
      return next
    })
  }

  const stop = () => {
    // An in-flight approval would otherwise hang the loop forever.
    pending?.resolve(false)
    setPending(null)
    abortRef.current?.abort()
  }

  const send = async (textOverride) => {
    const text = (textOverride ?? input).trim()
    if (!text || busy || !settings.model) return

    const chat = active ?? startNewChat()
    const userEntry = { id: crypto.randomUUID(), role: 'user', content: text }
    const entries = [...chat.messages, userEntry]

    patchChat(chat.id, (c) => ({
      ...c,
      title: c.messages.length === 0 ? titleFrom(text) : c.title,
      messages: entries,
    }))

    setInput('')
    setError('')
    setBusy(true)

    const controller = new AbortController()
    abortRef.current = controller

    const append = (entry) =>
      patchChat(chat.id, (c) => ({ ...c, messages: [...c.messages, entry] }))

    const update = (id, patch) =>
      patchChat(chat.id, (c) => ({
        ...c,
        messages: c.messages.map((m) => (m.id === id ? { ...m, ...patch(m) } : m)),
      }))

    try {
      await runAgent({
        settings,
        entries,
        agentMode,
        signal: controller.signal,
        append,
        update,
        newId: () => crypto.randomUUID(),
        requestApproval: () => new Promise((resolve) => setPending({ resolve })),
      })
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message)
    } finally {
      setBusy(false)
      abortRef.current = null
      setPending(null)
      // Drop any assistant placeholder that never produced text or tool calls.
      patchChat(chat.id, (c) => ({
        ...c,
        messages: c.messages.filter(
          (m) => m.role !== 'assistant' || m.content || m.toolCalls?.length,
        ),
      }))
      if (agentMode) refreshTree().catch(() => {})
    }
  }

  const decide = (approved) => {
    pending?.resolve(approved)
    setPending(null)
  }

  const messages = active?.messages ?? []
  const suggestions = agentMode ? AGENT_SUGGESTIONS : SUGGESTIONS

  return (
    <div className="app">
      <Sidebar
        chats={chats}
        activeId={activeId}
        open={sidebarOpen}
        onSelect={(id) => {
          setActiveId(id)
          setSidebarOpen(false)
        }}
        onNew={startNewChat}
        onDelete={deleteChat}
        onOpenSettings={() => setShowSettings(true)}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setSidebarOpen(true)} type="button">
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
          <button className="model-pill" onClick={() => setShowSettings(true)} type="button">
            <span className={`status-dot ${settings.model ? 'live' : ''}`} />
            {/* HF-style ids are long; the repo name alone is enough here. */}
            {settings.model.split('/').pop() || 'No model selected'}
          </button>
          {agentMode && <span className="agent-badge">Agent · {workspace.name}</span>}
          <button
            className={`files-toggle ${showFiles ? 'on' : ''}`}
            onClick={() => setShowFiles((v) => !v)}
            type="button"
          >
            Files
          </button>
        </header>

        <div className="thread">
          {messages.length === 0 ? (
            <div className="welcome">
              <h1>{agentMode ? `Working in ${workspace.name}` : 'What can I help with?'}</h1>
              <p>
                {agentMode
                  ? 'I can read, edit and run commands in this folder. Every write and command waits for your approval first.'
                  : 'Your conversation stays on this machine — it goes straight to your local model runtime and nowhere else.'}
              </p>
              <div className="suggestions">
                {suggestions.map((s) => (
                  <button key={s} onClick={() => send(s)} type="button">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages">
              {messages.map((m) =>
                m.role === 'tool' ? (
                  <ToolCard
                    key={m.id}
                    entry={m}
                    onApprove={() => decide(true)}
                    onReject={() => decide(false)}
                  />
                ) : (
                  <article key={m.id} className={`message ${m.role}`}>
                    <div className="avatar">{m.role === 'user' ? 'You' : 'AI'}</div>
                    <div className="bubble">
                      {m.role === 'assistant' ? (
                        m.content ? (
                          <Markdown>{m.content}</Markdown>
                        ) : (
                          <span className="typing">
                            <i />
                            <i />
                            <i />
                          </span>
                        )
                      ) : (
                        <p className="user-text">{m.content}</p>
                      )}
                    </div>
                  </article>
                ),
              )}
              <div ref={bottomRef} />
            </div>
          )}

          {error && (
            <div className="error-bar">
              {error}
              <button onClick={() => setShowSettings(true)} type="button">
                Open settings
              </button>
            </div>
          )}
        </div>

        <Composer
          value={input}
          onChange={setInput}
          onSend={() => send()}
          onStop={stop}
          busy={busy}
          disabled={!settings.model}
        />
      </main>

      {showFiles && (
        <Workspace
          workspace={workspace}
          onAttach={attachWorkspace}
          onBrowse={browseForFolder}
          onDetach={detachWorkspace}
          onOpenFile={openFile}
          recents={recents}
          picking={picking}
          error={wsError}
        />
      )}

      {viewFile && (
        <div className="modal-scrim" onClick={() => setViewFile(null)}>
          <div className="modal file-modal" onClick={(e) => e.stopPropagation()}>
            <header className="modal-head">
              <h2>{viewFile.path}</h2>
              <button className="icon-btn" onClick={() => setViewFile(null)} type="button">
                <svg viewBox="0 0 24 24" width="18" height="18">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" />
                </svg>
              </button>
            </header>
            <pre className="file-view">{viewFile.content}</pre>
          </div>
        </div>
      )}

      {showSettings && (
        <Settings
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSave={(next) => {
            setSettings(next)
            setShowSettings(false)
          }}
        />
      )}
    </div>
  )
}
