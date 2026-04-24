import { useEffect, useState } from 'react'

interface Persona {
  persona: string
  label: string
  allowed_fields: string
  row_filter: string | null
  description: string
}

interface PersonaView {
  persona: string
  label: string
  allowed_fields: string[]
  row_filter: string | null
  description: string
  visible_count: number
  total_count: number
  redacted_count: number
  wells: any[]
}

interface Chain {
  chain: { step: string; title: string; detail: string; examples: string[] }[]
}

export default function GovernanceTab() {
  const [personas, setPersonas]       = useState<Persona[]>([])
  const [active, setActive]           = useState('operator')
  const [view, setView]               = useState<PersonaView | null>(null)
  const [legal, setLegal]             = useState<any>(null)
  const [chain, setChain]             = useState<Chain | null>(null)
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    ;(async () => {
      const [p, c, t] = await Promise.all([
        fetch('/api/governance/personas').then(r => r.json()),
        fetch('/api/governance/uc_chain').then(r => r.json()),
        fetch('/api/governance/legal_tags').then(r => r.json()),
      ])
      setPersonas(p)
      setChain(c)
      setLegal(t)
      setLoading(false)
    })()
  }, [])

  useEffect(() => {
    ;(async () => {
      const v = await fetch(`/api/governance/view/${active}`).then(r => r.json())
      setView(v)
    })()
  }, [active])

  if (loading) return <div style={{ color: 'var(--text-muted)', padding: 40 }}>Loading governance…</div>

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Panel title="Governance chain · OSDU → Unity Catalog → App" subtitle="Legal tags propagate from source to the UI. Persona toggle below demonstrates runtime enforcement.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {chain?.chain.map((s, i) => (
            <div key={s.step} style={{
              background: 'var(--bg-panel)', border: '1px solid var(--border)',
              borderRadius: 8, padding: 14, position: 'relative',
            }}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>STEP {i + 1}</div>
              <div style={{ fontWeight: 700, color: 'var(--teal)', fontSize: 14 }}>{s.step}</div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)', marginTop: 4, fontWeight: 600 }}>{s.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>{s.detail}</div>
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {s.examples.map(ex => (
                  <span key={ex} style={{
                    fontSize: 10, padding: '2px 7px', borderRadius: 4,
                    background: 'var(--bg-card)', color: 'var(--text-muted)',
                    fontFamily: 'monospace',
                  }}>{ex}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
        <Panel title="Persona" subtitle="Switch persona to see enforcement">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {personas.map(p => (
              <button key={p.persona} onClick={() => setActive(p.persona)} style={{
                textAlign: 'left', padding: '10px 12px',
                background: active === p.persona ? 'var(--blue-dim)' : 'var(--bg-panel)',
                border: `1px solid ${active === p.persona ? 'var(--blue)' : 'var(--border)'}`,
                borderRadius: 6, cursor: 'pointer',
              }}>
                <div style={{ fontWeight: 600, color: active === p.persona ? 'var(--blue)' : 'var(--text-primary)', fontSize: 13 }}>
                  {p.label}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.4 }}>{p.description}</div>
              </button>
            ))}
          </div>
        </Panel>

        <Panel
          title={`Active view · ${view?.label || active}`}
          subtitle={`${view?.visible_count}/${view?.total_count} rows visible · ${view?.redacted_count} hidden by row filter · ${view?.allowed_fields?.length === 1 && view.allowed_fields[0] === 'all' ? 'all fields' : `${view?.allowed_fields?.length || 0} allowed fields`}`}
        >
          {view && (
            <>
              {view.row_filter && (
                <div style={{
                  padding: 8, marginBottom: 10, borderRadius: 6,
                  background: 'var(--amber-dim)', border: '1px solid var(--amber)',
                  fontSize: 11, color: 'var(--amber)', fontFamily: 'monospace',
                }}>
                  Row filter: {view.row_filter}
                </div>
              )}
              <div style={{ overflow: 'auto', maxHeight: 380 }}>
                <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)' }}>
                    <tr>
                      <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10 }}>well_id</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10 }}>well_name</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10 }}>basin</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10 }}>status</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10 }}>notes</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10 }}>lat/lon</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10 }}>API #</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.wells.map((w: any) => (
                      <tr key={w.well_id} style={{ borderTop: '1px solid var(--border-dim)' }}>
                        <td style={{ padding: '5px 8px', fontFamily: 'monospace', color: 'var(--blue)' }}>{w.well_id}</td>
                        <Td v={w.well_name} />
                        <Td v={w.basin} />
                        <Td v={w.status} />
                        <Td v={w.notes} trunc={40} />
                        <Td v={w.lat && w.lon ? `${String(w.lat).slice(0, 6)}, ${String(w.lon).slice(0, 7)}` : w.lat} />
                        <Td v={w.api_number} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Panel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Panel title="OSDU legal tags" subtitle="Live from catalog.adme_osdu.gov_legal_tags">
          {legal?.error ? (
            <div style={{ fontSize: 11, color: 'var(--amber)' }}>⚠️ {legal.error}</div>
          ) : legal?.legal_tags?.length ? (
            <div style={{ maxHeight: 220, overflow: 'auto' }}>
              {legal.legal_tags.map((t: any, i: number) => (
                <div key={i} style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-dim)' }}>
                  <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--teal)' }}>
                    {t.legal_tag_name} {t.is_valid ? '✓' : '✗'}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t.description}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No legal tag data yet</div>
          )}
        </Panel>
        <Panel title={`OSDU entitlement groups (${legal?.total_groups || 0})`} subtitle="group membership drives ADME record ACL">
          {legal?.entitlement_groups?.length ? (
            <div style={{ maxHeight: 220, overflow: 'auto' }}>
              {legal.entitlement_groups.map((g: any, i: number) => (
                <div key={i} style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-dim)' }}>
                  <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--purple)' }}>{g.group_name || g.group_id}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{g.description}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No entitlement group data yet</div>
          )}
        </Panel>
      </div>
    </div>
  )
}

function Td({ v, trunc }: { v: any; trunc?: number }) {
  const redacted = v === '🔒 redacted'
  const val = v == null ? '—' : trunc && typeof v === 'string' && v.length > trunc ? v.slice(0, trunc) + '…' : String(v)
  return (
    <td style={{ padding: '5px 8px', color: redacted ? 'var(--red)' : 'var(--text-primary)', fontStyle: redacted ? 'italic' : 'normal' }}>
      {val}
    </td>
  )
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
      padding: 16,
    }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}
