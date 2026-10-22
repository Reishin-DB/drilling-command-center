import { useEffect, useState } from 'react'

// The business context behind the engineer's briefing: governed glossary terms
// (with the thresholds the rules read) and the rule queries, both in Unity Catalog.
// Changing a threshold here updates business_glossary; the briefing re-runs every rule.

interface Term { term: string; definition: string; threshold: string; threshold_value: number | null; owner: string; source: string }
interface Rule { rule_id: string; title: string; glossary_term: string; severity: string; owner_role: string; action: string; check_sql: string }
interface RulesResp { glossary: Term[]; rules: Rule[]; tables: string[]; catalog_url: string }

const UNITS: Record<string, string> = {
  'H2S safety audit interval': 'days', 'H2S re-sample interval': 'days', 'Long-lead sour component': 'weeks lead',
  'Sour capex materiality': '% of NPV10', 'Sour service': 'ppm H2S',
}

export default function RulesPanel({ onChanged }: { onChanged: () => void }) {
  const [d, setD] = useState<RulesResp | null>(null)
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState<Record<string, string>>({})
  const [sqlFor, setSqlFor] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')

  const load = () => fetch('/api/engineer/rules').then(r => r.json()).then((x: RulesResp) => {
    setD(x); setEdit(Object.fromEntries(x.glossary.filter(g => g.threshold_value != null).map(g => [g.term, String(g.threshold_value)])))
  }).catch(() => {})
  useEffect(() => { if (open && !d) load() }, [open])

  const apply = async (term: string) => {
    setBusy(term); setMsg('')
    const v = Number(edit[term])
    await fetch('/api/engineer/glossary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ term, threshold_value: v }) })
    await load(); onChanged(); setBusy('')
    setMsg(`${term} set to ${v} ${UNITS[term] || ''} in business_glossary; every rule re-ran against it.`)
  }

  return (
    <div className="card" style={{ padding: '14px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>The rules behind this briefing</div>
          <div style={{ fontSize: 14.5, color: 'var(--text-muted)' }}>Business context the business owns, governed in Unity Catalog: glossary terms with their thresholds and owners, and rules that are read-only queries over the governed tables. Change a threshold and the briefing changes, no code.</div>
        </div>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {d && <a className="cs-btn" href={d.catalog_url} target="_blank" rel="noopener noreferrer">business_glossary in Catalog Explorer ↗</a>}
          <button className="cs-btn cs-btn-primary" onClick={() => setOpen(o => !o)}>{open ? 'Hide' : 'Show'} the glossary and rules</button>
        </span>
      </div>
      {open && !d && <div style={{ marginTop: 12 }}><span className="spinner" /></div>}
      {open && d && (
        <div style={{ marginTop: 14, display: 'grid', gap: 14 }}>
          {msg && <div style={{ fontSize: 14.5, color: 'var(--green)' }}>{msg}</div>}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14.5 }}>
            <thead><tr style={{ color: 'var(--text-muted)', textAlign: 'left', fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              <th style={th}>Glossary term</th><th style={th}>Definition</th><th style={th}>Owner</th><th style={{ ...th, width: 250 }}>Threshold the rules read</th></tr></thead>
            <tbody>{d.glossary.map(g => (
              <tr key={g.term} style={{ borderTop: '1px solid var(--border-dim)', verticalAlign: 'top' }}>
                <td style={{ ...td, fontWeight: 600, color: 'var(--text-primary)' }}>{g.term}</td>
                <td style={{ ...td, color: 'var(--text-secondary)' }}>{g.definition}</td>
                <td style={td}>{g.owner}</td>
                <td style={td}>{g.threshold_value == null
                  ? <span className="mono" style={{ color: 'var(--text-muted)' }}>{g.threshold}</span>
                  : <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="number" value={edit[g.term] ?? ''} onChange={e => setEdit({ ...edit, [g.term]: e.target.value })}
                        style={{ width: 80, padding: '4px 6px', background: 'var(--bg-panel)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 14.5 }} />
                      <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{UNITS[g.term] || ''}</span>
                      <button className="cs-btn" disabled={busy === g.term || Number(edit[g.term]) === g.threshold_value} onClick={() => apply(g.term)} style={{ padding: '4px 10px' }}>{busy === g.term ? '…' : 'Apply'}</button>
                    </span>}</td>
              </tr>))}</tbody>
          </table>
          <div>
            <div className="label" style={{ fontSize: 12.5, marginBottom: 6 }}>Rules (engineer_rules)</div>
            {d.rules.map(r => (
              <div key={r.rule_id} style={{ padding: '6px 0', borderTop: '1px solid var(--border-dim)', fontSize: 14.5 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span className="mono" style={{ color: 'var(--blue)' }}>{r.rule_id}</span>
                  <b>{r.title}</b>
                  <span style={{ color: 'var(--text-muted)' }}>reads glossary term "{r.glossary_term}" · {r.severity} · owner {r.owner_role}</span>
                  <button className="cs-btn" style={{ marginLeft: 'auto', padding: '3px 10px' }} onClick={() => setSqlFor(sqlFor === r.rule_id ? '' : r.rule_id)}>{sqlFor === r.rule_id ? 'Hide' : 'Show'} SQL</button>
                </div>
                {sqlFor === r.rule_id && <pre className="mono" style={{ marginTop: 6, fontSize: 12.5, whiteSpace: 'pre-wrap', background: 'var(--bg-panel)', border: '1px solid var(--border-dim)', borderRadius: 6, padding: 10, color: 'var(--teal)' }}>{r.check_sql}</pre>}
              </div>))}
          </div>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: '4px 6px', fontWeight: 600 }
const td: React.CSSProperties = { padding: '8px 6px' }
