import { useState } from 'react'
import Logo from './Logo'
import Markdown from './Markdown'

function Actions({ content, onRegenerate }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  }

  return (
    <div className="msg-actions">
      <button onClick={copy} title="Copy" type="button">
        {copied ? (
          <svg viewBox="0 0 24 24" width="15" height="15">
            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="15" height="15">
            <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.7" fill="none" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" />
          </svg>
        )}
      </button>
      {onRegenerate && (
        <button onClick={onRegenerate} title="Regenerate" type="button">
          <svg viewBox="0 0 24 24" width="15" height="15">
            <path
              d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4"
              stroke="currentColor"
              strokeWidth="1.8"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </div>
  )
}

export default function Message({ entry, onRegenerate }) {
  if (entry.role === 'user') {
    return (
      <article className="message user">
        <div className="user-bubble">{entry.content}</div>
      </article>
    )
  }

  return (
    <article className="message assistant">
      <div className="assistant-head">
        <Logo size={24} className="assistant-mark" />
        <span className="assistant-name">CodeEasy</span>
      </div>
      <div className="assistant-body">
        {entry.content ? (
          <Markdown>{entry.content}</Markdown>
        ) : (
          <span className="typing">
            <i />
            <i />
            <i />
          </span>
        )}
        {entry.content && <Actions content={entry.content} onRegenerate={onRegenerate} />}
      </div>
    </article>
  )
}
