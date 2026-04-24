import { useEffect, useRef, useState } from 'react'

interface ToolTrace {
  tool: string
  args: Record<string, any>
  result_preview: string
  ms: number
}

interface Msg {
  role: 'user' | 'agent'
  text?: string
  error?: string
  trace?: ToolTrace[]
  latency_ms?: number
}

const SUGGESTIONS = [
  'Find 3 wells similar to our best producer',
  'What is the break-even WTI for BAKER-001?',
  'Forecast production for CONOCO-7H over 10 years',
  'Which well should we drill next based on NPV?',
  'Explain the washout anomalies in BAKER-002',
]

export default function ExpertAgentTab({ wellId, onWellChange }: { wellId: string; onWellChange: (w: string) => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [q, setQ] = useState('')
  const [tools, setTools] = useState<{ name: string; description: string }[]>([])
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/agent/tools').then(r => r.json()).then(setTools)
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [msgs, loading])

  async function ask(text: string) {
    if (!text.trim() || loading) return
    setMsgs(m => [...m, { role: 'user', text }])
    setQ('')
    setLoading(true)
    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: text,
          well_id: wellId,
          history: msgs.map(m => ({ role: m.role === 'agent' ? 'assistant' : 'user', content: m.text || '' })),
        }),
      }).then(r => r.json())
      if (res.error) {
        setMsgs(m => [...m, { role: 'agent', error: res.error, trace: res.trace }])
      } else {
        setMsgs(m => [...m, { role: 'agent', text: res.answer, trace: res.trace, latency_ms: res.latency_ms }])
      }
    } catch (e: any) {
      setMsgs(m => [...m, { role: 'agent', error: String(e) }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2.6fr 1fr', gap: 16 }}>
      {/* Chat */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
        display: 'flex', flexDirection: 'column', height: 640,
      }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            <span style={{
              background: 'linear-gradient(135deg, var(--teal), var(--blue))',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>Expert Agent</span>
            <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 11, marginLeft: 8 }}>
              Claude Sonnet 4.5 + Vector Search + UC Functions
            </span>
          </div>
          {wellId && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Active well context: <span style={{ color: 'var(--blue)', fontFamily: 'monospace' }}>{wellId}</span>
            </div>
          )}
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          {msgs.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              <div style={{ marginBottom: 10 }}>Ask anything about wells, economics, or operations. The agent will call the right tools:</div>
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => ask(s)} style={{
                  display: 'block', width: '100%', textAlign: 'left', marginBottom: 6,
                  padding: '7px 10px', fontSize: 11,
                  background: 'var(--bg-panel)', border: '1px solid var(--border)',
                  borderRadius: 6, color: 'var(--text-secondary)', cursor: 'pointer',
                }}>{s}</button>
              ))}
            </div>
          )}
          {msgs.map((m, i) => <Bubble key={i} m={m} onWellChange={onWellChange} />)}
          {loading && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              <span style={{ color: 'var(--teal)' }}>🔧 agent is reasoning + calling tools</span>…
            </div>
          )}
        </div>

        <form onSubmit={e => { e.preventDefault(); ask(q) }} style={{
          padding: 10, borderTop: '1px solid var(--border)', display: 'flex', gap: 8,
        }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Ask the expert agent…"
                 disabled={loading}
                 style={{
                   flex: 1, background: 'var(--bg-panel)', border: '1px solid var(--border)',
                   borderRadius: 6, padding: '8px 10px', fontSize: 12, color: 'var(--text-primary)',
                 }} />
          <button type="submit" disabled={loading || !q.trim()} style={{
            padding: '0 14px', fontSize: 12, fontWeight: 600,
            background: loading || !q.trim() ? 'var(--bg-panel)' : 'linear-gradient(135deg, var(--teal), var(--blue))',
            color: loading || !q.trim() ? 'var(--text-muted)' : '#0d0e11',
            border: 'none', borderRadius: 6, cursor: loading ? 'default' : 'pointer',
          }}>Ask</button>
        </form>
      </div>

      {/* Tools panel */}
      <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
        <Panel title="Agent tools" subtitle={`${tools.length} tools wired via Claude function-calling`}>
          <div style={{ display: 'grid', gap: 8 }}>
            {tools.map(t => (
              <div key={t.name} style={{
                background: 'var(--bg-panel)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '7px 9px', fontSize: 11,
              }}>
                <div style={{ fontFamily: 'monospace', color: 'var(--teal)', fontSize: 11 }}>{t.name}()</div>
                <div style={{ color: 'var(--text-muted)', marginTop: 2, fontSize: 10, lineHeight: 1.4 }}>{t.description}</div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Architecture">
          <ol style={{ fontSize: 11, color: 'var(--text-secondary)', paddingLeft: 16, lineHeight: 1.6 }}>
            <li>Chat → Databricks Foundation Model (Claude Sonnet 4.5)</li>
            <li>Claude emits tool calls → tool-use blocks</li>
            <li>Backend dispatches to UC Functions / Vector Search / DuckDB</li>
            <li>Results returned, loop until final answer</li>
            <li>Every call traced with latency</li>
          </ol>
        </Panel>
      </div>
    </div>
  )
}

function Bubble({ m, onWellChange: _onWellChange }: { m: Msg; onWellChange: (w: string) => void }) {
  if (m.role === 'user') {
    return (
      <div style={{
        marginBottom: 12, textAlign: 'right',
      }}>
        <span style={{
          display: 'inline-block', maxWidth: '85%',
          background: 'var(--blue-dim)', border: '1px solid var(--blue)',
          borderRadius: 10, padding: '6px 10px', fontSize: 12, color: 'var(--text-primary)',
        }}>{m.text}</span>
      </div>
    )
  }
  return (
    <div style={{ marginBottom: 14 }}>
      {m.trace && m.trace.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {m.trace.map((t, i) => (
            <div key={i} style={{
              fontSize: 10, fontFamily: 'monospace',
              background: 'var(--bg-panel)', border: '1px solid var(--border-dim)',
              borderLeft: '2px solid var(--teal)',
              borderRadius: 4, padding: '4px 8px', marginBottom: 3,
            }}>
              <span style={{ color: 'var(--teal)', fontWeight: 600 }}>🔧 {t.tool}</span>
              <span style={{ color: 'var(--text-muted)' }}>({JSON.stringify(t.args).slice(1, -1)})</span>
              <span style={{ color: 'var(--text-muted)', float: 'right' }}>{t.ms} ms</span>
              <div style={{ color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'pre-wrap', fontSize: 9 }}>
                {t.result_preview.slice(0, 180)}{t.result_preview.length > 180 ? '…' : ''}
              </div>
            </div>
          ))}
        </div>
      )}
      {m.error && (
        <div style={{
          background: 'var(--red-dim)', border: '1px solid var(--red)', color: 'var(--red)',
          padding: 8, fontSize: 11, borderRadius: 6,
        }}>⚠️ {m.error}</div>
      )}
      {m.text && (
        <div style={{
          background: 'var(--bg-panel)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '9px 11px', fontSize: 12, color: 'var(--text-primary)',
          lineHeight: 1.55, whiteSpace: 'pre-wrap',
        }}>{m.text}</div>
      )}
      {m.latency_ms != null && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>
          completed in {m.latency_ms} ms
        </div>
      )}
    </div>
  )
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}
