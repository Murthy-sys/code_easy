import { useState } from 'react'

function TreeNode({ node, depth, onOpen }) {
  const [open, setOpen] = useState(depth < 1)

  if (node.type === 'file') {
    return (
      <button
        className="tree-row file"
        style={{ paddingLeft: 10 + depth * 13 }}
        onClick={() => onOpen(node.path)}
        type="button"
      >
        <span className="tree-dot" />
        {node.name}
      </button>
    )
  }

  return (
    <>
      <button
        className="tree-row dir"
        style={{ paddingLeft: 10 + depth * 13 }}
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <span className={`tree-caret ${open ? 'open' : ''}`}>›</span>
        {node.name}
      </button>
      {open &&
        (node.children ?? []).map((child) => (
          <TreeNode key={child.path} node={child} depth={depth + 1} onOpen={onOpen} />
        ))}
    </>
  )
}

export default function Workspace({
  workspace,
  onAttach,
  onBrowse,
  onDetach,
  onOpenFile,
  recents,
  picking,
  error,
}) {
  const [path, setPath] = useState('')
  const [showPathField, setShowPathField] = useState(false)

  if (!workspace) {
    return (
      <div className="ws-panel">
        <h3>Workspace</h3>
        <p className="ws-hint">
          Attach a project folder and the model can read, edit and run commands in it — every
          change waits for your approval.
        </p>

        <button className="browse-btn" onClick={onBrowse} disabled={picking} type="button">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path
              d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
              stroke="currentColor"
              strokeWidth="1.7"
              fill="none"
              strokeLinejoin="round"
            />
          </svg>
          {picking ? 'Waiting for Finder…' : 'Choose folder…'}
        </button>

        {recents.length > 0 && (
          <div className="ws-recents">
            <span className="ws-label">Recent</span>
            {recents.map((r) => (
              <button key={r} className="recent-row" onClick={() => onAttach(r)} type="button">
                <span className="recent-name">{r.split('/').filter(Boolean).pop()}</span>
                <code className="recent-path">{r}</code>
              </button>
            ))}
          </div>
        )}

        {showPathField ? (
          <form
            className="ws-form"
            onSubmit={(e) => {
              e.preventDefault()
              if (path.trim()) onAttach(path.trim())
            }}
          >
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="~/Desktop/my-project"
              spellCheck={false}
              autoFocus
            />
            <button className="ghost-btn small" type="submit">
              Attach path
            </button>
          </form>
        ) : (
          <button className="link-btn" onClick={() => setShowPathField(true)} type="button">
            or paste a path
          </button>
        )}

        {error && <p className="ws-error">{error}</p>}
      </div>
    )
  }

  return (
    <div className="ws-panel attached">
      <div className="ws-head">
        <div>
          <h3>{workspace.name}</h3>
          <code className="ws-root" title={workspace.root}>
            {workspace.root}
          </code>
        </div>
        <button className="ghost-btn small" onClick={onDetach} type="button">
          Detach
        </button>
      </div>
      <div className="tree">
        {(workspace.tree ?? []).map((node) => (
          <TreeNode key={node.path} node={node} depth={0} onOpen={onOpenFile} />
        ))}
      </div>
    </div>
  )
}
