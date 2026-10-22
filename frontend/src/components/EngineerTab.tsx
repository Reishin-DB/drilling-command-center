import { useEffect, useState } from 'react'
import RulesPanel from './RulesPanel'

// Engineer persona: the morning briefing from the operations agent.
// Action items come from governed glossary rules run over UC data (GET /api/engineer/briefing);
// each links to where it gets closed out: dashboard, app tab, Catalog Explorer, Genie, or a ticket.

export interface Link { label: string; kind: 'catalog' | 'dashboard' | 'app' | 'ticket' | 'genie'; url?: string; target?: string; question?: string }
export interface Item {
  item_key: string; rule_id: string; title: string; severity: string; owner: string; action: string
  well_id: string; subject: string; evidence: string; metric: number | null; threshold: number | null
  glossary: { term: string; definition: string; threshold: string; owner: string; source: string } | null
  source_tables: string[]; links: Link[]; status: string; closed_by: string | null
  tickets: { ticket_id: string; created_at: string; created_by: string; title: string; status: string }[]
}
export interface Briefing {
  items: Item[]; rules: number; glossary_terms: number; focus_well: string; open_focus: number; open_total: number
  other_wells: string[]; dashboard_url: string; genie_url: string
  agent: { note: string | null; served_by?: string; validation?: { grounded: boolean; figures_checked: number; unsupported: string[] } | null; facts?: { id: string; label: string }[] }
}

const SEV: Record<string, string> = { critical: '#ff3621', high: '#f5a524', medium: '#4fb3e8', low: '#a6b7c2' }

export async function loadBriefing(): Promise<Briefing> {
  const r = await fetch('/api/engineer/briefing')
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

function Note({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[A\d+\])/g)
  return <>{parts.map((p, i) => /^\*\*/.test(p) ? <b key={i}>{p.slice(2, -2)}</b>
    : /^\[A\d+\]$/.test(p) ? <span key={i} className="mono" style={{ fontSize: 12, padding: '0 5px', marginLeft: 2, borderRadius: 4, border: '1px solid #4fb3e866', color: 'var(--blue)', background: 'var(--blue-dim)' }}>{p.slice(1, -1)}</span>
    : <span key={i}>{p}</span>)}</>
}

export default function EngineerTab({ onNavigate, onWell }: { onNavigate: (tab: string) => void; onWell: (w: string) => void }) {
  const [b, setB] = useState<Briefing | null>(null)
  const [err, setErr] = useState('')
  const [scope, setScope] = useState<'focus' | 'all'>('focus')
  const [busy, setBusy] = useState<string>('')
  const [flash, setFlash] = useState<Record<string, string>>({})

  const refresh = () => loadBriefing().then(setB).catch(e => setErr(String(e)))
  useEffect(() => { refresh() }, [])

  const ticket = async (i: Item, label: string) => {
    setBusy(i.item_key)
    const r = await fetch('/api/engineer/tickets', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_key: i.item_key, rule_id: i.rule_id, well_id: i.well_id, title: `${label.replace(/^Create /, '')}: ${i.well_id} ${i.subject}`, detail: `${i.action} Evidence: ${i.evidence}` }) }).then(r => r.json()).catch(() => null)
    setFlash(f => ({ ...f, [i.item_key]: r?.ticket_id ? `Ticket ${r.ticket_id} created in engineer_tickets` : 'Ticket failed' }))
    await refresh(); setBusy('')
  }
  const close = async (i: Item) => {
    setBusy(i.item_key)
    await fetch('/api/engineer/close', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_key: i.item_key, status: i.status === 'open' ? 'closed' : 'open' }) }).catch(() => null)
    await refresh(); setBusy('')
  }
  const follow = (i: Item, l: Link) => {
    if (l.kind === 'genie') window.dispatchEvent(new CustomEvent('open-genie', { detail: { question: l.question } }))
    else if (l.kind === 'app') { onWell(i.well_id); onNavigate(l.target || 'equipment') }
    else if (l.kind === 'ticket') ticket(i, l.label)
    else if (l.url) window.open(l.url, '_blank', 'noopener')
  }

  if (err) return <div className="card" style={{ padding: 20, color: 'var(--amber)' }}>Could not load the briefing: {err}</div>
  if (!b) return <div className="card" style={{ padding: 20, display: 'flex', gap: 10, alignItems: 'center' }}><span className="spinner" /> The operations agent is checking the rules against this morning's data…</div>

  const shown = b.items.filter(i => scope === 'all' || i.well_id === b.focus_well)
  const v = b.agent?.validation
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="card" style={{ padding: '18px 20px', borderColor: '#ff362166', background: 'linear-gradient(90deg, #ff362112, transparent 65%)' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 600px' }}>
            <div className="label" style={{ fontSize: 13.5 }}>Morning briefing · production engineer · operations agent</div>
            <div style={{ fontSize: 21, fontWeight: 600, margin: '6px 0 8px' }}>
              Good morning. <span style={{ color: SEV.critical }}>{b.open_focus} action items</span> on <span className="mono">{b.focus_well}</span>, the extreme-sour well, and {b.open_total - b.open_focus} more on {b.other_wells.length} other wells.
            </div>
            {b.agent?.note && <div style={{ fontSize: 17, lineHeight: 1.55, color: 'var(--text-secondary)' }}><Note text={b.agent.note} /></div>}
            <div style={{ fontSize: 13.5, color: 'var(--text-muted)', marginTop: 8 }}>
              Built from {b.rules} governed rules and {b.glossary_terms} glossary terms in Unity Catalog, run against this morning's data.
              {b.agent?.served_by && <> Note written by <span className="mono">{b.agent.served_by}</span> from the items' evidence only.</>}
            </div>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {v && (v.grounded ? <span className="cs-prov cs-prov-live">Grounded · {v.figures_checked} figures traced</span>
              : <span className="cs-prov cs-prov-ill">{v.unsupported.length} figure(s) not in the items</span>)}
            <a className="cs-btn" href={b.dashboard_url} target="_blank" rel="noopener noreferrer">Sour-service dashboard ↗</a>
            <button className="cs-btn" onClick={() => window.dispatchEvent(new CustomEvent('open-genie', { detail: { question: `What needs attention on ${b.focus_well} this morning, and which glossary rules flag it?` } }))}>Ask Genie about {b.focus_well}</button>
          </div>
        </div>
      </div>

      <RulesPanel onChanged={refresh} />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {(['focus', 'all'] as const).map(s => (
          <button key={s} className="cs-btn" onClick={() => setScope(s)} style={scope === s ? { borderColor: 'var(--amber)', background: 'var(--amber-dim)', color: 'var(--text-primary)' } : undefined}>
            {s === 'focus' ? `${b.focus_well} (${b.items.filter(i => i.well_id === b.focus_well).length})` : `All wells (${b.items.length})`}
          </button>))}
        <span style={{ marginLeft: 'auto', fontSize: 14, color: 'var(--text-muted)' }}>Close-outs and tickets are written back to Unity Catalog.</span>
      </div>

      {shown.map(i => {
        const done = i.status !== 'open'
        return (
          <div key={i.item_key} className="card" style={{ padding: '14px 18px', borderLeft: `4px solid ${done ? 'var(--border)' : SEV[i.severity] || 'var(--border)'}`, opacity: done ? 0.6 : 1 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span className="badge" style={{ color: SEV[i.severity], border: `1px solid ${SEV[i.severity]}`, background: `${SEV[i.severity]}1f`, fontSize: 12.5, textTransform: 'uppercase' }}>{i.severity}</span>
              <span style={{ fontSize: 18.5, fontWeight: 650, textDecoration: done ? 'line-through' : 'none' }}>{i.title}</span>
              <span className="mono" style={{ fontSize: 14.5, color: 'var(--blue)' }}>{i.well_id}</span>
              <span style={{ fontSize: 14.5, color: 'var(--text-muted)' }}>{i.subject}</span>
              <span style={{ marginLeft: 'auto', fontSize: 13.5, color: 'var(--text-muted)' }}>{i.rule_id} · owner {i.owner}</span>
            </div>
            <div className="mono" style={{ fontSize: 14.5, color: 'var(--text-primary)', margin: '8px 0 6px' }}>{i.evidence}</div>
            <div style={{ fontSize: 15.5, color: 'var(--text-secondary)' }}><b style={{ color: 'var(--text-primary)' }}>Action:</b> {i.action}</div>
            {i.glossary && <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 6 }}>
              Glossary · <b style={{ color: 'var(--text-secondary)' }}>{i.glossary.term}</b>: {i.glossary.definition} <span className="mono">({i.glossary.threshold}; owner {i.glossary.owner})</span>
            </div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
              {i.links.map(l => (
                <button key={l.label} className={l.kind === 'ticket' ? 'cs-btn cs-btn-primary' : 'cs-btn'} disabled={busy === i.item_key || (done && l.kind === 'ticket')} onClick={() => follow(i, l)}>
                  {l.label}{l.kind === 'catalog' || l.kind === 'dashboard' ? ' ↗' : ''}
                </button>))}
              <button className="cs-btn" disabled={busy === i.item_key} onClick={() => close(i)}>{done ? 'Reopen' : 'Close out'}</button>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>source: {i.source_tables.join(', ')}</span>
            </div>
            {(flash[i.item_key] || i.tickets.length > 0) && <div style={{ fontSize: 14, marginTop: 8, color: 'var(--green)' }}>
              {flash[i.item_key] && <div>{flash[i.item_key]}</div>}
              {i.tickets.map(t => <div key={t.ticket_id} className="mono">{t.ticket_id} · {t.title} · {t.status} · {t.created_by}</div>)}
            </div>}
            {done && <div style={{ fontSize: 13.5, marginTop: 6, color: 'var(--text-muted)' }}>Closed by {i.closed_by}</div>}
          </div>
        )
      })}
    </div>
  )
}
