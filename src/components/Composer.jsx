import { useEffect, useRef } from 'react'

export default function Composer({ value, onChange, onSend, onStop, busy, disabled }) {
  const ref = useRef(null)

  // Grow with the content, up to a ceiling, then scroll.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [value])

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  return (
    <div className="composer-wrap">
      <div className="composer">
        <textarea
          ref={ref}
          rows={1}
          value={value}
          placeholder={disabled ? 'Pick a model in Settings first…' : 'Message your local model…'}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {busy ? (
          <button className="send-btn stop" onClick={onStop} title="Stop" type="button">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
            </svg>
          </button>
        ) : (
          <button
            className="send-btn"
            onClick={onSend}
            disabled={!value.trim() || disabled}
            title="Send (Enter)"
            type="button"
          >
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path
                d="M12 19V5M6 11l6-6 6 6"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>
      <p className="disclaimer">Runs entirely on your machine · Enter to send, Shift+Enter for a new line</p>
    </div>
  )
}
