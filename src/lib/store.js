// Chats and settings live in localStorage — nothing leaves the machine.

const CHATS_KEY = 'local-llm.chats'
const SETTINGS_KEY = 'local-llm.settings'
const RECENTS_KEY = 'local-llm.recent-folders'

export const DEFAULT_SETTINGS = {
  baseUrl: '/llm',
  dialect: 'openai',
  model: '',
  temperature: 0.7,
  systemPrompt: 'You are a helpful assistant running locally on the user’s machine.',
  theme: 'dark',
}

const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota or private mode — not worth interrupting the user */
  }
}

export const loadChats = () => read(CHATS_KEY, [])
export const saveChats = (chats) => write(CHATS_KEY, chats)

export const loadSettings = () => ({ ...DEFAULT_SETTINGS, ...read(SETTINGS_KEY, {}) })
export const saveSettings = (settings) => write(SETTINGS_KEY, settings)

export const loadRecents = () => read(RECENTS_KEY, [])

/** Most-recent-first, de-duplicated, capped at 5. */
export const rememberFolder = (root) => {
  const next = [root, ...loadRecents().filter((r) => r !== root)].slice(0, 5)
  write(RECENTS_KEY, next)
  return next
}

export const newChat = () => ({
  id: crypto.randomUUID(),
  title: 'New chat',
  createdAt: Date.now(),
  messages: [],
})

/** First user line, trimmed to something that fits the sidebar. */
export const titleFrom = (text) => {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > 42 ? `${clean.slice(0, 42)}…` : clean || 'New chat'
}
