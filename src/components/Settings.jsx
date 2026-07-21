import { useEffect, useState } from 'react'
import { listModels } from '../lib/llm'

export default function Settings({ settings, onSave, onClose }) {
  const [draft, setDraft] = useState(settings)
  const [models, setModels] = useState([])
  const [status, setStatus] = useState('idle') // idle | loading | ok | error
  const [error, setError] = useState('')

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))

  const refresh = async (config = draft) => {
    setStatus('loading')
    setError('')
    try {
      const found = await listModels(config.baseUrl, config.dialect)
      setModels(found)
      setStatus('ok')
      if (found.length && !found.includes(config.model)) set({ model: found[0] })
    } catch (err) {
      setModels([])
      setStatus('error')
      setError(err.message)
    }
  }

  // Probe the server once when the dialog opens, so the model list is populated.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh(settings)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={onClose} type="button">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
        </header>

        <label className="field">
          <span>API dialect</span>
          <select value={draft.dialect} onChange={(e) => set({ dialect: e.target.value })}>
            <option value="ollama">Ollama (/api/chat)</option>
            <option value="openai">OpenAI-compatible (/v1/chat/completions)</option>
          </select>
          <small>LM Studio, llama.cpp server and vLLM all speak the OpenAI dialect.</small>
        </label>

        <label className="field">
          <span>Base URL</span>
          <input
            value={draft.baseUrl}
            onChange={(e) => set({ baseUrl: e.target.value })}
            placeholder="/llm"
          />
          <small>
            Leave as <code>/llm</code> to use the dev-server proxy (no CORS setup needed), or point
            straight at e.g. <code>http://localhost:11434</code>.
          </small>
        </label>

        <div className="field">
          <span>Model</span>
          <div className="row">
            {models.length > 0 ? (
              <select value={draft.model} onChange={(e) => set({ model: e.target.value })}>
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={draft.model}
                onChange={(e) => set({ model: e.target.value })}
                placeholder="llama3.2"
              />
            )}
            <button className="ghost-btn" type="button" onClick={() => refresh()}>
              {status === 'loading' ? 'Checking…' : 'Refresh'}
            </button>
          </div>
          {status === 'ok' && (
            <small className="ok">Connected — {models.length} model(s) available.</small>
          )}
          {status === 'error' && (
            <small className="bad">
              Can’t reach the server: {error}. Start it first (e.g. <code>ollama serve</code>).
            </small>
          )}
        </div>

        <label className="field">
          <span>Temperature — {draft.temperature.toFixed(2)}</span>
          <input
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={draft.temperature}
            onChange={(e) => set({ temperature: Number(e.target.value) })}
          />
        </label>

        <label className="field">
          <span>System prompt</span>
          <textarea
            rows={3}
            value={draft.systemPrompt}
            onChange={(e) => set({ systemPrompt: e.target.value })}
          />
        </label>

        <label className="field">
          <span>Theme</span>
          <select value={draft.theme} onChange={(e) => set({ theme: e.target.value })}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>

        <footer className="modal-foot">
          <button className="ghost-btn" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="primary-btn" onClick={() => onSave(draft)} type="button">
            Save
          </button>
        </footer>
      </div>
    </div>
  )
}
