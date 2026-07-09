import { useEffect, useRef, useState } from 'react'

interface SpecialistInfo {
  id: string
  name: string
  feature: string
  endpoint?: string
  desc?: string
}

interface SpecialistResult {
  id: string
  name: string
  feature: string
  endpoint?: string
  ms?: number
  result?: string
  evidence?: string
  question?: string
  error?: string
  skipped?: boolean
  reason?: string
}

interface SupervisorInfo {
  name: string
  model: string
  specialists: SpecialistInfo[]
}

interface WellOpt { well_id: string; well_name: string; basin?: string }

interface RouteDecision { id: string; name: string; engage: boolean; reason: string }
interface Plan { strategy: string; route: RouteDecision[]; model?: string; plan_ms?: number }
interface CostInfo { model: string; calls: number; prompt_tokens: number; completion_tokens: number; in_per_m: number; out_per_m: number; usd: number }
interface GovInfo { gateway: string; guardrails: string[]; audit: string; data: string; model_governed: string }
interface ModelOpt { id: string; label: string; family: string; inPerM?: number; outPerM?: number; tier?: string }

const PRESET_QUESTIONS: { q: string; well: string }[] = [
  { q: 'Should we drill an infill development well next to BAKER-001 in the Mancos / Westwater play?',   well: 'BAKER-001' },
  { q: 'Is PIONEER-22S worth re-fracking given current WTI and the recent BHA failure?',                  well: 'PIONEER-22S' },
  { q: 'Should we accelerate the SHELL-3D lateral or hold for the Q3 capex window?',                      well: 'SHELL-3D' },
  { q: 'What is the economic + ESG case to spud a Wolfcamp A development well near MARATHON-15X?',        well: 'MARATHON-15X' },
]

type Status = 'idle' | 'running' | 'done' | 'error' | 'skipped'

export default function SupervisorTab() {
  const [info, setInfo]       = useState<SupervisorInfo | null>(null)
  const [wells, setWells]     = useState<WellOpt[]>([])
  const [question, setQ]      = useState(PRESET_QUESTIONS[0].q)
  const [wellId, setWellId]   = useState<string>('BAKER-001')
  const [wti, setWti]         = useState<number>(75)
  const [runMeta, setRunMeta] = useState<{ well_name?: string; basin?: string; formation?: string; analog_well_id?: string; analog_field?: string } | null>(null)
  const [running, setRunning] = useState(false)
  const [status, setStatus]   = useState<Record<string, Status>>({})
  const [results, setResults] = useState<Record<string, SpecialistResult>>({})
  const [rec, setRec]         = useState<{ text: string; total_ms: number; verdict?: string; model?: string; cost?: CostInfo; governance?: GovInfo } | null>(null)
  const [plan, setPlan]       = useState<Plan | null>(null)
  const [err, setErr]         = useState<string | null>(null)
  const [models, setModels]   = useState<ModelOpt[]>([])
  const [model, setModel]     = useState<string>('databricks-claude-sonnet-4-5')

  useEffect(() => {
    fetch('/api/model').then(r => r.json()).then(d => {
      if (d.model) setModel(d.model)
      if (Array.isArray(d.available)) setModels(d.available)
    }).catch(() => {})
  }, [])

  function pickModel(m: string) {
    const prev = model
    setModel(m)
    fetch('/api/model', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: m }) })
      .then(r => r.json()).then(d => { if (!d.ok) setModel(prev) })
      .catch(() => setModel(prev))
  }

  const MODEL_LABEL: Record<string, string> = {
    'databricks-claude-sonnet-4-5': 'Claude Sonnet 4.5',
    'databricks-claude-opus-4-8': 'Claude Opus 4.8',
    'databricks-claude-haiku-4-5': 'Claude Haiku 4.5',
    'databricks-gpt-oss-120b': 'GPT-OSS 120B',
    'databricks-llama-4-maverick': 'Llama 4 Maverick',
    'databricks-qwen35-122b-a10b': 'Qwen 3.5 122B',
  }
  const isOpen = (m: string) => /gpt-oss|llama|qwen|gemma/.test(m)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    fetch('/api/supervisor/info').then(r => r.json()).then(setInfo).catch(() => {})
    fetch('/api/wells').then(r => r.json()).then((ws: any[]) => {
      setWells(ws.filter(w => !w.well_id.startsWith('OSDU-')).map(w => ({ well_id: w.well_id, well_name: w.well_name, basin: w.basin })))
    }).catch(() => {})
  }, [])

  async function ask() {
    if (!question.trim() || running) return
    setRunning(true); setRec(null); setErr(null); setResults({}); setRunMeta(null); setPlan(null); setStatus({})
    const ac = new AbortController(); abortRef.current = ac
    try {
      const resp = await fetch('/api/supervisor/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ question, well_id: wellId, wti_price: wti }),
        signal: ac.signal,
      })
      if (!resp.body) throw new Error('no body')
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let nl
        while ((nl = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, nl); buf = buf.slice(nl + 2)
          let ev = 'message', dataStr = ''
          for (const line of chunk.split('\n')) {
            if (line.startsWith('event:')) ev = line.slice(6).trim()
            else if (line.startsWith('data:')) dataStr += line.slice(5).trim()
          }
          if (!dataStr) continue
          let data: any
          try { data = JSON.parse(dataStr) } catch { continue }
          if (ev === 'start') {
            const init: Record<string, Status> = {}
            for (const s of data.specialists || []) init[s.id] = 'idle'
            setStatus(init)
            setRunMeta({
              well_name: data.well_name, basin: data.basin, formation: data.formation,
              analog_well_id: data.analog_well_id, analog_field: data.analog_field,
            })
          } else if (ev === 'plan') {
            setPlan(data as Plan)
            setStatus(prev => {
              const next = { ...prev }
              for (const r of (data.route || []) as RouteDecision[]) next[r.id] = r.engage ? 'running' : 'skipped'
              return next
            })
          } else if (ev === 'specialist') {
            setResults(prev => ({ ...prev, [data.id]: data }))
            setStatus(prev => ({ ...prev, [data.id]: data.skipped ? 'skipped' : data.error ? 'error' : 'done' }))
          } else if (ev === 'recommendation') {
            setRec({ text: data.text || '', total_ms: data.total_ms || 0, verdict: data.verdict, model: data.model, cost: data.cost, governance: data.governance })
          } else if (ev === 'done') {
            // noop
          }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') setErr(String(e.message || e))
    } finally {
      setRunning(false); abortRef.current = null
    }
  }

  function cancel() {
    abortRef.current?.abort()
    setRunning(false)
  }

  const order = ['analogs','petrophysics','economics','regulatory','operations']
  const specialistsRender = info?.specialists ?
    order.map(id => info.specialists.find(s => s.id === id)).filter(Boolean) as SpecialistInfo[]
    : []

  return (
    <div style={{ display: 'grid', gap: 16 }}>

      {/* Header — what & why */}
      <div style={{
        background: 'linear-gradient(120deg, var(--bg-card), var(--bg-panel))',
        border: '1px solid var(--border)', borderRadius: 10, padding: 18,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 22 }}>🧠</span>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{info?.name || 'Subsurface Supervisor'}</div>
          <span style={{
            fontSize: 10, fontFamily: 'monospace', padding: '2px 9px', borderRadius: 10,
            background: 'var(--blue-dim)', color: 'var(--blue)', border: '1px solid var(--blue)',
          }}>multi-agent · plans → routes → synthesizes</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          Pick one of the operator's NA wells. Five Databricks AI services fire in parallel:
          <b> Vector Search</b> pulls global ADME analogs from the OSDU catalog, <b>Model Serving</b> cross-checks
          petrophysics against the analog, <b>UC Functions</b> rate economics, the <b>ADME legal-tag</b> gate
          checks compliance, and <b>Drilling Operations</b> reads rig/NPT/supply chain from Lakebase.
          The supervisor synthesises a drill-or-hold recommendation with citations.
        </div>
      </div>

      {/* Control · Cost · Choice — live model picker (routes the Supervisor's FM calls) */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
        padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', color: '#4dabf7' }}>CHOICE · COST · CONTROL</span>
        <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>pick a model — the Supervisor routes to it, no code change · governed by AI Gateway · price = $/1M tokens:</span>
        {(models.length ? models : [{ id: 'databricks-claude-sonnet-4-5', label: 'Claude Sonnet 4.5', family: 'Anthropic', inPerM: 3, outPerM: 15, tier: '$$' }]).map(m => {
          const active = m.id === model
          const tierColor = m.tier === '$$$' ? '#E67E22' : m.tier === '$$' ? '#F39C12' : '#27AE60'
          return (
            <button key={m.id} onClick={() => pickModel(m.id)} title={`${m.id}\n$${m.inPerM}/1M in · $${m.outPerM}/1M out`} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
              background: active ? 'var(--blue-dim)' : 'var(--bg-panel)',
              border: `1px solid ${active ? '#4dabf7' : 'var(--border)'}`, borderRadius: 6, padding: '4px 9px',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: active ? '#4dabf7' : 'var(--text-muted)' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: active ? '#4dabf7' : 'var(--text-secondary)' }}>{m.label || MODEL_LABEL[m.id] || m.id}</span>
              <span style={{ fontSize: 8.5, fontWeight: 700, color: m.family === 'Open' ? '#27AE60' : '#9254de' }}>{m.family || (isOpen(m.id) ? 'Open' : 'Anthropic')}</span>
              {m.tier && <span style={{ fontSize: 9, fontWeight: 800, color: tierColor, letterSpacing: '0.5px' }}>{m.tier}</span>}
            </button>
          )
        })}
      </div>

      {/* Question form */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px 130px 130px', gap: 10, alignItems: 'end' }}>
          <div>
            <Label>Question</Label>
            <textarea value={question} onChange={e => setQ(e.target.value)} rows={2} style={txt(running)} />
          </div>
          <div>
            <Label>Operator well</Label>
            <select value={wellId} onChange={e => setWellId(e.target.value)} style={inp(running)} disabled={running}>
              {wells.length === 0 && <option value={wellId}>{wellId}</option>}
              {wells.map(w => (
                <option key={w.well_id} value={w.well_id}>{w.well_id} · {w.basin || '—'}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>WTI ($/bbl)</Label>
            <input type="number" value={wti} step={1} min={20} max={150} onChange={e => setWti(Number(e.target.value))} style={inp(running)} disabled={running} />
          </div>
          <button onClick={running ? cancel : ask} disabled={!running && !question.trim()} style={{
            background: running ? 'var(--red)' : 'var(--blue)',
            color: 'white', border: 'none', borderRadius: 6, padding: '11px 14px',
            fontSize: 12, fontWeight: 700, cursor: running ? 'pointer' : (question.trim() ? 'pointer' : 'not-allowed'),
            letterSpacing: '0.02em',
          }}>
            {running ? '◼ Cancel' : '▶ Run supervisor'}
          </button>
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PRESET_QUESTIONS.map((p, i) => (
            <button key={i} onClick={() => { setQ(p.q); setWellId(p.well) }} disabled={running} style={{
              fontSize: 11, padding: '5px 10px', borderRadius: 12,
              background: 'var(--bg-panel)', color: 'var(--text-secondary)',
              border: '1px solid var(--border)', cursor: running ? 'default' : 'pointer',
            }}>{p.q.slice(0, 70)}{p.q.length > 70 ? '…' : ''}</button>
          ))}
        </div>
        {runMeta && (runMeta.well_name || runMeta.analog_well_id) && (
          <div style={{
            marginTop: 10, padding: '8px 12px', fontSize: 11, color: 'var(--text-secondary)',
            background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 6,
            display: 'flex', gap: 14, flexWrap: 'wrap',
          }}>
            {runMeta.well_name && <span>Well · <b style={{ color: 'var(--text-primary)' }}>{runMeta.well_name}</b> ({runMeta.basin})</span>}
            {runMeta.formation && <span>Formation · <b style={{ color: 'var(--text-primary)' }}>{runMeta.formation}</b></span>}
            {runMeta.analog_well_id && <span>ADME analog · <b style={{ color: 'var(--teal)' }}>{runMeta.analog_well_id}</b> ({runMeta.analog_field})</span>}
          </div>
        )}
        {err && <div style={{ marginTop: 10, color: 'var(--red)', fontSize: 11 }}>⚠ {err}</div>}
      </div>

      {/* Orchestration plan — supervisor decided which agents this question needs */}
      {plan && (
        <div style={{
          background: 'linear-gradient(120deg, var(--bg-card), var(--bg-panel))',
          border: '1px solid #4dabf7', borderRadius: 10, padding: '14px 16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', color: '#4dabf7' }}>ORCHESTRATION PLAN</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>supervisor decided which agents this question needs</span>
            {plan.plan_ms != null && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>{plan.plan_ms} ms</span>}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-primary)', lineHeight: 1.5, marginBottom: 10 }}>{plan.strategy}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--blue-dim)',
              border: '1px solid #4dabf7', borderRadius: 8, padding: '4px 10px', fontSize: 11, fontWeight: 700, color: '#4dabf7',
            }}>🧠 Supervisor</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>→</span>
            {plan.route.map(r => (
              <span key={r.id} title={r.reason} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: r.engage ? 'rgba(39,174,96,0.12)' : 'var(--bg-panel)',
                border: `1px solid ${r.engage ? 'rgba(39,174,96,0.5)' : 'var(--border)'}`,
                borderRadius: 8, padding: '4px 10px', fontSize: 11,
                color: r.engage ? '#27AE60' : 'var(--text-muted)',
                textDecoration: r.engage ? 'none' : 'line-through', opacity: r.engage ? 1 : 0.75,
              }}>
                {r.engage ? '✓' : '○'} {r.name}
                {r.reason && <span style={{ fontSize: 9.5, fontWeight: 400, color: r.engage ? 'rgba(39,174,96,0.8)' : 'var(--text-muted)' }}>· {r.reason}</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Specialist cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        {specialistsRender.map(s => {
          const st = status[s.id] || 'idle'
          const r  = results[s.id]
          return (
            <SpecialistCard key={s.id} info={s} status={st} result={r} />
          )
        })}
      </div>

      {/* Recommendation — giant verdict card + reasoning */}
      <VerdictCard rec={rec} running={running} />

      {/* Cost + Governance — the omnigent Cost / Control story for this run */}
      {rec && (rec.cost || rec.governance) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {rec.cost && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: '#F39C12', marginBottom: 8 }}>💰 COST · THIS RUN</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 24, fontWeight: 800, color: '#F39C12' }}>
                  {rec.cost.usd < 0.01 ? `${(rec.cost.usd * 100).toFixed(3)}¢` : `$${rec.cost.usd.toFixed(4)}`}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{rec.cost.calls} model call{rec.cost.calls === 1 ? '' : 's'}</span>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', lineHeight: 1.7, fontFamily: 'monospace' }}>
                <div>in: {rec.cost.prompt_tokens.toLocaleString()} tok × ${rec.cost.in_per_m}/1M</div>
                <div>out: {rec.cost.completion_tokens.toLocaleString()} tok × ${rec.cost.out_per_m}/1M</div>
              </div>
              <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginTop: 6 }}>Switch to a cheaper model above — same orchestration, lower cost per run.</div>
            </div>
          )}
          {rec.governance && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--teal)', marginBottom: 8 }}>🛡️ GOVERNANCE</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-primary)', fontWeight: 600, marginBottom: 6 }}>{rec.governance.gateway}</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                {rec.governance.guardrails.map(g => (
                  <span key={g} style={{ fontSize: 9.5, color: 'var(--teal)', background: 'var(--blue-dim)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 7px' }}>{g}</span>
                ))}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <div>📋 {rec.governance.audit}</div>
                <div>🔒 {rec.governance.data}</div>
              </div>
            </div>
          )}
        </div>
      )}



      {/* Architecture note */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16,
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>How this works</div>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          <li><b>Plan:</b> the supervisor first reasons about your question and routes to only the specialists it needs (shown in the Orchestration Plan). Skipped agents are dimmed.</li>
          <li><b>Fan-out + stream:</b> the engaged specialists run concurrently; results stream to this UI via Server-Sent Events as each completes — no waiting on the slowest.</li>
          <li><b>Synthesise:</b> a final call on the chosen model (<code>{model}</code>) takes the engaged outputs and produces the recommendation with citations.</li>
          <li><b>Choice · Cost · Governance:</b> swap the model at runtime (no redeploy); the run's real token cost is metered; every call is AI-Gateway governed and audit-logged, and UC / ADME persona enforcement applies here too.</li>
        </ol>
      </div>
    </div>
  )
}

const VERDICT_STYLE: Record<string, { color: string; bg: string; sub: string }> = {
  DRILL:    { color: '#27AE60', bg: 'rgba(39,174,96,0.12)',  sub: 'Commit capital · greenlight execution' },
  HOLD:     { color: '#F39C12', bg: 'rgba(243,156,18,0.12)', sub: 'Defer · revisit when conditions improve' },
  'DE-SCOPE': { color: '#CD6116', bg: 'rgba(205,97,22,0.14)',sub: 'Reduce scope · partial commitment only' },
  ABANDON:  { color: '#E74C3C', bg: 'rgba(231,76,60,0.12)',  sub: 'Walk away · economics or risk do not support' },
  REVIEW:   { color: '#4dabf7', bg: 'rgba(77,171,247,0.12)', sub: 'Mixed signal · needs senior review' },
}

function VerdictCard({ rec, running }: { rec: { text: string; total_ms: number; verdict?: string; model?: string } | null; running: boolean }) {
  const v = rec?.verdict || 'REVIEW'
  const style = VERDICT_STYLE[v] || VERDICT_STYLE['REVIEW']
  const hasRec = !!rec
  return (
    <div style={{
      background: hasRec ? `linear-gradient(135deg, var(--bg-card) 0%, ${style.bg} 100%)` : 'var(--bg-card)',
      border: `1px solid ${hasRec ? style.color : 'var(--border)'}`,
      borderRadius: 12, padding: 20, position: 'relative', overflow: 'hidden',
    }}>
      {hasRec && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: `linear-gradient(90deg, ${style.color}, transparent)`,
        }} />
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
        {/* Verdict badge */}
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
            Verdict
          </div>
          {hasRec ? (
            <div style={{
              display: 'inline-block', padding: '14px 24px',
              background: style.color, color: 'white',
              borderRadius: 8, fontSize: 28, fontWeight: 800, letterSpacing: '0.04em',
              boxShadow: `0 4px 24px ${style.bg}`,
            }}>{v}</div>
          ) : (
            <div style={{
              display: 'inline-block', padding: '14px 24px',
              background: 'var(--bg-panel)', border: '1px dashed var(--border)',
              borderRadius: 8, fontSize: 24, fontWeight: 800, color: 'var(--text-muted)',
            }}>{running ? '…' : '—'}</div>
          )}
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
            {hasRec ? style.sub : (running ? 'awaiting specialist results' : 'submit a question to run')}
          </div>
          {hasRec && rec?.model && (
            <div style={{ fontSize: 10, color: '#4dabf7', marginTop: 4, fontFamily: 'monospace' }}>
              model: {rec.model}
            </div>
          )}
        </div>

        {/* Reasoning */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Supervisor reasoning</div>
            {hasRec && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>synthesised in {rec.total_ms}ms</span>}
          </div>
          {!hasRec && !running && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pick a well and submit a question above. The supervisor fans 5 specialists out in parallel then synthesises here.</div>
          )}
          {!hasRec && running && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Specialists are working… synthesis happens once all 5 land.</div>
          )}
          {hasRec && (
            <div style={{ fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {typeof rec.text === 'string' ? rec.text : JSON.stringify(rec.text)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


function SpecialistCard({ info, status, result }: { info: SpecialistInfo; status: Status; result?: SpecialistResult }) {
  const colorMap = {
    idle:    { border: 'var(--border)',   dot: 'var(--text-muted)', label: 'idle' },
    running: { border: 'var(--amber)',    dot: 'var(--amber)',      label: 'running…' },
    done:    { border: 'var(--green)',    dot: 'var(--green)',      label: result?.ms ? `done · ${result.ms}ms` : 'done' },
    error:   { border: 'var(--red)',      dot: 'var(--red)',        label: 'error' },
    skipped: { border: 'var(--border)',   dot: 'var(--text-muted)', label: 'not engaged' },
  }
  const c = colorMap[status]
  const skipped = status === 'skipped'
  return (
    <div style={{
      background: 'var(--bg-card)', border: `1px solid ${c.border}`,
      borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 6,
      minHeight: 230, opacity: skipped ? 0.55 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          width: 8, height: 8, borderRadius: 4, background: c.dot,
          animation: status === 'running' ? 'pulse 1.2s infinite' : 'none',
        }} />
        <div style={{ fontSize: 10, fontFamily: 'monospace', color: c.dot, letterSpacing: '0.04em' }}>{c.label}</div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>{info.name}</div>
      <span style={{
        fontSize: 9, fontFamily: 'monospace', padding: '2px 6px', borderRadius: 4, alignSelf: 'flex-start',
        background: 'var(--blue-dim)', color: 'var(--blue)',
      }}>{info.feature}</span>
      {info.endpoint && <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{info.endpoint}</div>}

      <div style={{
        flex: 1, marginTop: 4, padding: 8, borderRadius: 4,
        background: 'var(--bg-panel)', fontSize: 10, color: 'var(--text-secondary)',
        whiteSpace: 'pre-wrap', overflow: 'auto', maxHeight: 280, lineHeight: 1.5,
      }}>
        {status === 'idle'    && <span style={{ color: 'var(--text-muted)' }}>{info.desc || 'awaiting question…'}</span>}
        {status === 'running' && <Skeleton />}
        {status === 'skipped' && <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{result?.reason ? `Skipped — ${result.reason}` : 'Skipped by the orchestration plan.'}</span>}
        {status === 'done'    && (typeof result?.result === 'string' ? result.result : result?.result ? JSON.stringify(result.result) : '(no output)')}
        {status === 'error'   && <span style={{ color: 'var(--red)' }}>{result?.error || 'failed'}</span>}
      </div>
      {result?.question && status === 'done' && (
        <div style={{ fontSize: 9, color: 'var(--text-muted)', fontStyle: 'italic' }}>Q: {result.question}</div>
      )}
    </div>
  )
}

function Skeleton() {
  return (
    <div style={{ display: 'grid', gap: 5 }}>
      {[1,2,3,4].map(i => (
        <div key={i} style={{ height: 8, borderRadius: 3, background: 'var(--bg-card)', opacity: 0.6, animation: 'pulse 1.2s infinite', animationDelay: `${i * 0.15}s` }} />
      ))}
      <style>{`@keyframes pulse { 0%,100% { opacity:.3 } 50% { opacity:.8 } }`}</style>
    </div>
  )
}

function Label({ children }: { children: any }) {
  return <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{children}</div>
}

const txt = (disabled: boolean): any => ({
  width: '100%', padding: '8px 10px', borderRadius: 6,
  background: 'var(--bg-panel)', color: 'var(--text-primary)',
  border: '1px solid var(--border)', fontSize: 12, fontFamily: 'inherit',
  resize: 'vertical', opacity: disabled ? 0.6 : 1,
})
const inp = (disabled: boolean): any => ({
  width: '100%', padding: '9px 10px', borderRadius: 6,
  background: 'var(--bg-panel)', color: 'var(--text-primary)',
  border: '1px solid var(--border)', fontSize: 12, opacity: disabled ? 0.6 : 1,
})
