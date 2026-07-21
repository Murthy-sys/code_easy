import Logo from './Logo'

export default function Sidebar({
  chats,
  activeId,
  open,
  onSelect,
  onNew,
  onDelete,
  onOpenSettings,
  onClose,
}) {
  return (
    <>
      <div className={`scrim ${open ? 'show' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-top">
          <div className="brand">
            <Logo size={22} />
            CodeEasy
          </div>
          <button className="icon-btn" onClick={onNew} title="New chat (⌘K)" type="button">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <nav className="chat-list">
          {chats.length === 0 && <p className="empty-note">No conversations yet.</p>}
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={`chat-item ${chat.id === activeId ? 'active' : ''}`}
              onClick={() => onSelect(chat.id)}
            >
              <span className="chat-title">{chat.title}</span>
              <button
                className="del-btn"
                type="button"
                title="Delete chat"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(chat.id)
                }}
              >
                <svg viewBox="0 0 24 24" width="15" height="15">
                  <path
                    d="M6 7h12M10 11v6M14 11v6M7 7l1 12h8l1-12M9 7V4h6v3"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    fill="none"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          ))}
        </nav>

        <button className="settings-btn" onClick={onOpenSettings} type="button">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" fill="none" />
            <path
              d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"
              stroke="currentColor"
              strokeWidth="1.4"
              fill="none"
            />
          </svg>
          Settings
        </button>
      </aside>
    </>
  )
}
