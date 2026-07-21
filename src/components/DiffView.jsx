import { useMemo } from 'react'
import { diffLines } from 'diff'

/** Unified line diff, collapsed to a few lines of context around each change. */
export default function DiffView({ before, after, context = 3 }) {
  const rows = useMemo(() => {
    const parts = diffLines(before ?? '', after ?? '')
    const all = []
    let beforeNo = 1
    let afterNo = 1

    for (const part of parts) {
      const lines = part.value.split('\n')
      if (lines.at(-1) === '') lines.pop()
      for (const text of lines) {
        if (part.added) all.push({ type: 'add', text, no: afterNo++ })
        else if (part.removed) all.push({ type: 'del', text, no: beforeNo++ })
        else all.push({ type: 'ctx', text, no: afterNo++, beforeNo: beforeNo++ })
      }
    }

    // Keep only changed lines plus surrounding context.
    const keep = new Set()
    all.forEach((row, i) => {
      if (row.type === 'ctx') return
      for (let j = i - context; j <= i + context; j++) if (all[j]) keep.add(j)
    })

    const out = []
    let skipping = false
    all.forEach((row, i) => {
      if (keep.has(i)) {
        out.push(row)
        skipping = false
      } else if (!skipping) {
        out.push({ type: 'gap' })
        skipping = true
      }
    })
    return out
  }, [before, after, context])

  const added = rows.filter((r) => r.type === 'add').length
  const removed = rows.filter((r) => r.type === 'del').length

  return (
    <div className="diff">
      <div className="diff-stat">
        <span className="add">+{added}</span>
        <span className="del">−{removed}</span>
      </div>
      <div className="diff-body">
        {rows.map((row, i) =>
          row.type === 'gap' ? (
            <div key={i} className="diff-gap">
              ⋯
            </div>
          ) : (
            <div key={i} className={`diff-row ${row.type}`}>
              <span className="diff-no">{row.no}</span>
              <span className="diff-sign">
                {row.type === 'add' ? '+' : row.type === 'del' ? '−' : ' '}
              </span>
              <span className="diff-text">{row.text || ' '}</span>
            </div>
          ),
        )}
      </div>
    </div>
  )
}
