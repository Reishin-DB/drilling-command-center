import { useState } from 'react'

// "Why this well, why now": a plain-English brief for the decision owner,
// written by the model from numbered governed facts, validated, and logged to UC.
// POST /api/voxels/decision_brief/{well}.

interface Fact { id: string; label: string; value: string }
interface Brief {
  brief_id: string; plan: string; facts: Fact[]
  validation: { figures_checked: number; unsupported: string[]; facts_cited: string[]; grounded: boolean }
  served_by: string; fell_back: boolean; usage: { prompt_tokens?: number; completion_tokens?: number }
  logged_to: string | null; log_error: string | null; error?: string
  attempts?: number; first_attempt_unsupported?: string[]
}

// Minimal renderer for the brief: **bold**, bullet lines, and [F#] citation chips.
function Line({ text, facts }: { text: string; facts: Fact[] }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[F\d+\])/g)
  return <>{parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <b key={i} style={{ color: 'var(--text-primary)' }}>{p.slice(2, -2)}</b>
    const m = p.match(/^\[(F\d+)\]$/)
    if (m) {
      const f = facts.find(x => x.id === m[1])
      return <span key={i} title={f ? `${f.label}: ${f.value}` : m[1]} className="mono" style={{ fontSize: 12, padding: '0 5px', marginLeft: 2, borderRadius: 4, border: '1px solid #4fb3e866', color: 'var(--blue)', background: 'var(--blue-dim)', cursor: 'help' }}>{m[1]}</span>
    }
    return <span key={i}>{p}</span>
  })}</>
}

export default function DecisionBriefCard({ wellId }: { wellId: string }) {
  const [b, setB] = useState<Brief | null>(null)
  const [busy, setBusy] = useState(false)
  const [showFacts, setShowFacts] = useState(false)
  const run = async () => {
    setBusy(true)
    try {
      const r = await fetch(`/api/voxels/decision_brief/${encodeURIComponent(wellId)}`, { method: 'POST' })
      setB(await r.json())
    } catch (e) {
      setB({ error: String(e) } as Brief)
    }
    setBusy(false)
  }
  const lines = (b?.plan || '').split('\n').map(l => l.trim()).filter(Boolean)
  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="label" style={{ fontSize: 13.5 }}>Decision brief · why this well, why now</div>
          <div style={{ fontSize: 15, color: 'var(--text-muted)' }}>Written for Landman's SVP Digital Operations and VP of Engineering from governed facts only; every figure is checked and every brief is logged to Unity Catalog.</div>
        </div>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {b?.validation && (b.validation.grounded
            ? <span className="cs-prov cs-prov-live" title={`${b.validation.figures_checked} figures checked against the facts`}>Grounded · {b.validation.figures_checked} figures traced</span>
            : <span className="cs-prov cs-prov-ill" title={b.validation.unsupported.join(', ')}>{b.validation.unsupported.length} figure(s) not in the facts</span>)}
          <button className="cs-btn cs-btn-primary" disabled={busy} onClick={run}>{busy ? 'Writing…' : b ? 'Rewrite brief' : 'Write the decision brief'}</button>
        </span>
      </div>

      {b?.error && <div style={{ marginTop: 12, color: 'var(--amber)', fontSize: 15 }}>{b.error}</div>}
      {b && !b.error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 18, marginTop: 14 }}>
          <div style={{ fontSize: 16.5, lineHeight: 1.6, color: 'var(--text-secondary)', display: 'grid', gap: 4 }}>
            {lines.map((l, i) => /^[-*•]\s/.test(l)
              ? <div key={i} style={{ paddingLeft: 16, position: 'relative' }}><span style={{ position: 'absolute', left: 2, color: 'var(--amber)' }}>•</span><Line text={l.replace(/^[-*•]\s/, '')} facts={b.facts} /></div>
              : <div key={i} style={{ marginTop: /^\*\*/.test(l) ? 8 : 0 }}><Line text={l} facts={b.facts} /></div>)}
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', display: 'grid', gap: 8, alignContent: 'start' }}>
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg-panel)', border: '1px solid var(--border-dim)', lineHeight: 1.6 }}>
              <div>Model: <span className="mono">{b.served_by}</span>{b.fell_back ? ' (failover)' : ''} via AI Gateway</div>
              <div>Tokens: {b.usage?.prompt_tokens ?? '–'} in · {b.usage?.completion_tokens ?? '–'} out</div>
              <div>Facts cited: {b.validation.facts_cited.join(', ') || 'none'}</div>
              {(b.attempts ?? 1) > 1 && <div>Self-corrected: draft 1 used {b.first_attempt_unsupported?.join(', ')} (not in the facts); rewritten without them</div>}
              <div>Logged: {b.logged_to ? <span className="mono">{b.logged_to.split('.').pop()}</span> : <span style={{ color: 'var(--amber)' }}>{b.log_error}</span>}</div>
            </div>
            <button className="cs-btn" onClick={() => setShowFacts(s => !s)}>{showFacts ? 'Hide' : 'Show'} the governed facts</button>
            {showFacts && <div style={{ display: 'grid', gap: 4 }}>{b.facts.map(f => (
              <div key={f.id}><span className="mono" style={{ color: 'var(--blue)' }}>{f.id}</span> {f.label}: <span style={{ color: 'var(--text-primary)' }}>{f.value}</span></div>))}</div>}
          </div>
        </div>
      )}
    </div>
  )
}
