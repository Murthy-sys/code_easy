import { useState } from 'react'
import DiffView from './DiffView'

const LABELS = {
  list_files: 'Listed files',
  read_file: 'Read',
  search: 'Searched for',
  edit_file: 'Edited',
  write_file: 'Wrote',
  delete_file: 'Deleted',
  run_command: 'Ran',
}

const ICONS = {
  running: '◍',
  awaiting: '⏸',
  done: '✓',
  rejected: '✕',
  failed: '!',
}

const parseArgs = (raw) => {
  try {
    return JSON.parse(raw || '{}')
  } catch {
    return {}
  }
}

/** One-line summary of what the tool touched. */
function subject(name, args) {
  if (name === 'run_command') return args.command
  if (name === 'search') return `"${args.query}"`
  if (name === 'list_files') return args.path === '.' ? 'project root' : args.path
  return args.path
}

export default function ToolCard({ entry, onApprove, onReject }) {
  const [open, setOpen] = useState(false)
  const args = parseArgs(entry.arguments)
  const waiting = entry.status === 'awaiting'
  const preview = entry.preview

  return (
    <div className={`tool-card ${entry.status} ${waiting ? 'waiting' : ''}`}>
      <button className="tool-head" onClick={() => setOpen((v) => !v)} type="button">
        <span className={`tool-icon ${entry.status}`}>{ICONS[entry.status] ?? '·'}</span>
        <span className="tool-label">{LABELS[entry.name] ?? entry.name}</span>
        <code className="tool-subject">{subject(entry.name, args)}</code>
        <span className="tool-chevron">{open ? '⌃' : '⌄'}</span>
      </button>

      {waiting && preview?.kind === 'diff' && (
        <DiffView before={preview.before} after={preview.after} />
      )}

      {waiting && preview?.kind === 'command' && (
        <pre className="tool-command">$ {preview.command}</pre>
      )}

      {waiting && preview?.kind === 'delete' && (
        <p className="tool-warn">This will permanently delete {preview.path}.</p>
      )}

      {waiting && (
        <div className="approval-row">
          <span className="approval-hint">
            {preview?.kind === 'command' ? 'Run this command?' : 'Apply this change?'}
          </span>
          <button className="ghost-btn small" onClick={onReject} type="button">
            Reject
          </button>
          <button className="primary-btn small" onClick={onApprove} type="button">
            Approve
          </button>
        </div>
      )}

      {entry.output && <pre className="tool-output">{entry.output}</pre>}

      {open && !waiting && (
        <pre className="tool-result">{entry.result || '(running…)'}</pre>
      )}
    </div>
  )
}
