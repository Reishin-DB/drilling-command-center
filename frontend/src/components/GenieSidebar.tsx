import { useEffect, useRef, useState } from 'react'

interface Msg {
  role: 'user' | 'genie'
  text?: string
  sql?: string | null
  columns?: string[]
  rows?: any[][]
  error?: string
}

const SAMPLE_QUESTIONS = [
  'How many wellbores per platform?',
  'Top 5 reservoirs by OOIP',
  'Average permeability by formation',
  'Surface lat/lon of producers',
  'Most-used entitlement groups',
]

export default function GenieSidebar() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [conv, setConv] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight })
  }, [msgs, loading])

  async function ask(text: string) {
    if (!text.trim() || loading) return
    setMsgs(m => [...m, { role: 'user', text }])
    setQ('')
    setLoading(true)
    try {
      const res = await fetch('/api/genie/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, conversation_id: conv }),
      }).then(r => r.json())
      if (res.error) {
        setMsgs(m => [...m, { role: 'genie', error: res.error }])
      } else {
        setConv(res.conversation_id || conv)
        setMsgs(m => [...m, {
          role: 'genie',
          text: res.text,
          sql: res.sql,
          columns: res.columns,
          rows: res.rows,
        }])
      }
    } catch (e: any) {
      setMsgs(m => [...m, { role: 'genie', error: String(e) }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Floating launcher */}
      <button onClick={() => setOpen(!open)} style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 50,
        width: 52, height: 52, borderRadius: 26,
        background: 'linear-gradient(135deg, #00E5FF, #4dabf7)',
        border: 'none', cursor: 'pointer',
        boxShadow: '0 4px 20px rgba(0, 229, 255, 0.35)',
        fontSize: 22, color: '#0d0e11',
      }} title="Ask Genie">
        {open ? '✕' : '✨'}
      </button>

      {open && (
        <div style={{
          position: 'fixed', bottom: 84, right: 20, zIndex: 49,
          width: 420, height: 560,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid var(--border)',
            background: 'var(--bg-panel)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>✨</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>Genie · OSDU</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  Natural language over 5 ADME tables
                </div>
              </div>
            </div>
          </div>

          {/* Body */}
          <div ref={bodyRef} style={{
            flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {msgs.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                <div style={{ marginBottom: 10 }}>Ask anything about OSDU wellbore, reservoir, rock-and-fluid or governance data. Examples:</div>
                {SAMPLE_QUESTIONS.map(s => (
                  <button key={s} onClick={() => ask(s)} style={{
                    display: 'block', width: '100%', textAlign: 'left', marginBottom: 6,
                    padding: '6px 10px', fontSize: 11,
                    background: 'var(--bg-panel)', border: '1px solid var(--border)',
                    borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer',
                  }}>{s}</button>
                ))}
              </div>
            )}
            {msgs.map((m, i) => (
              <MsgBubble key={i} m={m} />
            ))}
            {loading && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                <span style={{ color: 'var(--teal)' }}>✨ Genie is thinking</span>…
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={e => { e.preventDefault(); ask(q) }} style={{
            padding: 10, borderTop: '1px solid var(--border)', display: 'flex', gap: 8,
          }}>
            <input
              value={q} onChange={e => setQ(e.target.value)}
              placeholder="Ask a question…"
              disabled={loading}
              style={{
                flex: 1, background: 'var(--bg-panel)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '8px 10px', fontSize: 12, color: 'var(--text-primary)',
              }}
            />
            <button type="submit" disabled={loading || !q.trim()} style={{
              padding: '0 14px', fontSize: 12, fontWeight: 600,
              background: loading || !q.trim() ? 'var(--bg-panel)' : 'linear-gradient(135deg, #00E5FF, #4dabf7)',
              color: loading || !q.trim() ? 'var(--text-muted)' : '#0d0e11',
              border: 'none', borderRadius: 6, cursor: loading ? 'default' : 'pointer',
            }}>Ask</button>
          </form>
        </div>
      )}
    </>
  )
}

function MsgBubble({ m }: { m: Msg }) {
  if (m.role === 'user') {
    return (
      <div style={{
        alignSelf: 'flex-end', maxWidth: '85%',
        background: 'var(--blue-dim)', border: '1px solid var(--blue)',
        borderRadius: 10, padding: '6px 10px', fontSize: 12, color: 'var(--text-primary)',
      }}>
        {m.text}
      </div>
    )
  }
  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '95%' }}>
      {m.error && (
        <div style={{ background: 'var(--red-dim)', border: '1px solid var(--red)', color: 'var(--red)', padding: 8, fontSize: 11, borderRadius: 6 }}>
          ⚠️ {m.error}
        </div>
      )}
      {m.text && (
        <div style={{
          background: 'var(--bg-panel)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '8px 10px', fontSize: 12, color: 'var(--text-primary)',
          lineHeight: 1.5, whiteSpace: 'pre-wrap',
        }}>{m.text}</div>
      )}
      {m.sql && (
        <div style={{
          marginTop: 6, padding: '6px 8px', fontFamily: 'monospace', fontSize: 10,
          background: 'var(--bg-primary)', color: 'var(--teal)', border: '1px solid var(--border-dim)',
          borderRadius: 6, whiteSpace: 'pre-wrap', overflowX: 'auto',
        }}>{m.sql}</div>
      )}
      {m.rows && m.rows.length > 0 && (
        <div style={{
          marginTop: 6, maxHeight: 180, overflow: 'auto',
          border: '1px solid var(--border-dim)', borderRadius: 6,
        }}>
          <table style={{ width: '100%', fontSize: 10, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-panel)' }}>
                {(m.columns || []).map(c => (
                  <th key={c} style={{ padding: '4px 6px', textAlign: 'left', color: 'var(--text-muted)' }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.rows.slice(0, 30).map((row, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border-dim)' }}>
                  {row.map((v: any, j: number) => (
                    <td key={j} style={{ padding: '3px 6px', color: 'var(--text-primary)' }}>
                      {v == null ? '—' : typeof v === 'number' ? Number(v).toLocaleString() : String(v).slice(0, 60)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {m.rows.length > 30 && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: 4, textAlign: 'center' }}>
              + {m.rows.length - 30} more
            </div>
          )}
        </div>
      )}
    </div>
  )
}
