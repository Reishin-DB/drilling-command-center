import { useEffect, useMemo, useState } from 'react'

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

interface Co2Row { country_name: string; country_code: string; year: number; co2_kt: number }
interface Co2Resp { installed: boolean; source?: string; year?: number; rows: Co2Row[]; error?: string }

interface AuditEvent {
  event_time: string
  actor: string
  action: string
  service: string
  status: number
  target?: string
}
interface AuditResp { source: string; events: AuditEvent[]; synthetic: boolean; note?: string }

const SENSITIVE_COLS: { col: string; classification: string; rule: string; affects: string }[] = [
  { col: 'lat',         classification: 'Location · PII-adjacent', rule: 'Masked for analyst, external personas',   affects: 'silver_wellbore.lat'        },
  { col: 'lon',         classification: 'Location · PII-adjacent', rule: 'Masked for analyst, external personas',   affects: 'silver_wellbore.lon'        },
  { col: 'api_number',  classification: 'Regulatory ID',           rule: 'Masked for external persona',             affects: 'wells.api_number'           },
  { col: 'notes',       classification: 'Free-text · may contain PII', rule: 'Masked for external persona',         affects: 'wells.notes'                },
  { col: 'kb_elevation_ft', classification: 'Engineering detail',  rule: 'Visible to operator only',                affects: 'wells.kb_elevation_ft'      },
  { col: 'spud_date',   classification: 'Operational',             rule: 'Visible to operator only',                affects: 'wells.spud_date'            },
]

const COMPLIANCE_BADGES = [
  { label: 'ADME ACL inheritance',  status: 'Enforced',  detail: 'Legal tags propagated to UC row tags' },
  { label: 'Encryption at rest',    status: 'AES-256',   detail: 'Delta + Lakebase managed keys'         },
  { label: 'Encryption in transit', status: 'TLS 1.2+',  detail: 'OBO tokens, no static secrets'         },
  { label: 'Data residency',        status: 'Azure US',  detail: 'centralus · ADME opendes partition'    },
  { label: 'Retention policy',      status: '7 yr',      detail: 'Wells · audit logs 1 yr in system.access' },
  { label: 'GDPR / SOX ready',      status: 'Auditable', detail: 'Lineage + audit trail via Unity Catalog' },
]

export default function GovernanceTab() {
  const [personas, setPersonas] = useState<Persona[] | null>(null)
  const [active, setActive]     = useState('operator')
  const [view, setView]         = useState<PersonaView | null>(null)
  const [legal, setLegal]       = useState<any>(null)
  const [chain, setChain]       = useState<Chain | null>(null)
  const [co2, setCo2]           = useState<Co2Resp | null>(null)
  const [audit, setAudit]       = useState<AuditResp | null>(null)
  const [wellsCount, setWellsCount] = useState<{ total: number; osdu: number } | null>(null)

  // Each fetch resolves independently — no blocking gate.
  useEffect(() => { fetch('/api/governance/uc_chain').then(r => r.json()).then(setChain).catch(() => {}) }, [])
  useEffect(() => { fetch('/api/governance/personas').then(r => r.json()).then(setPersonas).catch(() => {}) }, [])
  useEffect(() => { fetch('/api/governance/legal_tags').then(r => r.json()).then(setLegal).catch(() => {}) }, [])
  useEffect(() => { fetch('/api/governance/co2').then(r => r.json()).then(setCo2).catch(() => {}) }, [])
  useEffect(() => { fetch('/api/governance/audit').then(r => r.json()).then(setAudit).catch(() => {}) }, [])
  useEffect(() => {
    fetch('/api/wells').then(r => r.json()).then((ws: any[]) => {
      setWellsCount({ total: ws.length, osdu: ws.filter(w => w.well_id?.startsWith('OSDU-')).length })
    }).catch(() => {})
  }, [])

  useEffect(() => {
    fetch(`/api/governance/view/${active}`).then(r => r.json()).then(setView).catch(() => {})
  }, [active])

  const rowFilterCount = useMemo(() => (personas || []).filter(p => p.row_filter).length, [personas])
  const allowedFieldsCount = useMemo(() => {
    const all = new Set<string>()
    ;(personas || []).forEach(p => (p.allowed_fields || '').split(',').forEach(f => f.trim() && all.add(f.trim())))
    return all.size
  }, [personas])

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        <Kpi label="ADME legal tags"   value={legal?.legal_tags?.length ?? '…'} sub={legal?.error ? 'UC fetch failed' : 'gov_legal_tags'} color="var(--teal)" />
        <Kpi label="Entitlement groups" value={legal?.total_groups ?? '…'}      sub="gov_entitlements" color="var(--purple)" />
        <Kpi label="Personas"          value={personas?.length ?? '…'}          sub={`${rowFilterCount} with row filters`} color="var(--blue)" />
        <Kpi label="Allowed fields"    value={allowedFieldsCount || '…'}        sub={`across ${personas?.length ?? 0} personas`} color="var(--amber)" />
        <Kpi label="Wells governed"    value={wellsCount?.total ?? '…'}         sub={wellsCount ? `${wellsCount.osdu} via ADME` : 'loading…'} color="var(--green)" />
      </div>

      <PersonaMaskProof />

      {/* Compliance badges */}
      <Panel title="Compliance posture" subtitle="Continuous controls inherited from ADME source through Unity Catalog">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {COMPLIANCE_BADGES.map(b => (
            <div key={b.label} style={{
              background: 'var(--bg-panel)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '10px 12px', display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 8,
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{b.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{b.detail}</div>
              </div>
              <span style={{
                fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
                padding: '3px 8px', borderRadius: 10,
                background: 'var(--green-dim)', color: 'var(--green)', whiteSpace: 'nowrap',
              }}>✓ {b.status}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Governance chain · ADME → Unity Catalog → App" subtitle="Legal tags propagate from source to the UI. Persona toggle below demonstrates runtime enforcement.">
        {chain ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {chain.chain.map((s, i) => (
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
        ) : <Skeleton lines={3} />}
      </Panel>

      <ControlCostChoice />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
        <Panel title="Persona" subtitle="Switch persona to see enforcement">
          {personas ? (
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
          ) : <Skeleton lines={3} />}
        </Panel>

        <Panel
          title={`Active view · ${view?.label || active}`}
          subtitle={view ? `${view?.visible_count}/${view?.total_count} rows visible · ${view?.redacted_count} hidden by row filter · ${view?.allowed_fields?.length === 1 && view.allowed_fields[0] === 'all' ? 'all fields' : `${view?.allowed_fields?.length || 0} allowed fields`}` : 'loading…'}
        >
          {view ? (
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
          ) : <Skeleton lines={5} />}
        </Panel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Panel title="ADME legal tags" subtitle={`Live from ${legal?.source || `${'<catalog>'}.<schema>`}.gov_legal_tags`}>
          {!legal ? <Skeleton lines={4} /> : legal.error ? (
            <div style={{ fontSize: 11, color: 'var(--amber)' }}>⚠️ {legal.error}</div>
          ) : legal.legal_tags?.length ? (
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
        <Panel title={`ADME entitlements${legal?.total_groups ? ` (${legal.total_groups})` : ''}`} subtitle="group membership drives ADME record ACL">
          {!legal ? <Skeleton lines={4} /> : legal.entitlement_groups?.length ? (
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

      {/* Sensitive columns inventory */}
      <Panel title="Sensitive columns inventory" subtitle="Column-level masking rules enforced by Unity Catalog per persona">
        <div style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Column', 'Classification', 'Masking rule', 'Bound to'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SENSITIVE_COLS.map(c => (
                <tr key={c.col} style={{ borderBottom: '1px solid var(--border-dim)' }}>
                  <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: 'var(--amber)' }}>{c.col}</td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-primary)' }}>{c.classification}</td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-secondary)' }}>{c.rule}</td>
                  <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{c.affects}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Audit events feed */}
      <Panel
        title="Audit events"
        subtitle={audit?.synthetic ? 'Synthetic demo events · grant SELECT ON system.access.audit to wire live' : `Live · ${audit?.source ?? 'system.access.audit'}`}
      >
        {!audit ? <Skeleton lines={5} /> : audit.events.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No recent events</div>
        ) : (
          <div style={{ maxHeight: 280, overflow: 'auto' }}>
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)' }}>
                <tr>
                  {['Time', 'Actor', 'Action', 'Service', 'Status', 'Target'].map(h => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-muted)', fontSize: 10, borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {audit.events.map((e, i) => {
                  const ok = e.status >= 200 && e.status < 300
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-dim)' }}>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatTime(e.event_time)}</td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-primary)' }}>{e.actor}</td>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: 'var(--blue)' }}>{e.action}</td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{e.service}</td>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 600, color: ok ? 'var(--green)' : 'var(--red)' }}>{e.status}</td>
                      <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{e.target || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* ESG / CO2 panel */}
      <Panel
        title="ESG · CO₂ emissions"
        subtitle={
          co2?.installed
            ? `Top emitters · ${co2.year} · live from ${co2.source}`
            : co2?.error
              ? `Marketplace not wired: ${co2.error.slice(0, 80)}`
              : 'World Bank Open Data via Databricks Marketplace'
        }
      >
        {!co2 ? <Skeleton lines={6} /> : co2.installed && co2.rows.length > 0 ? (
          <div>
            {(() => {
              const max = Math.max(...co2.rows.map(r => r.co2_kt || 0))
              return co2.rows.map(r => {
                const pct = max ? ((r.co2_kt || 0) / max) * 100 : 0
                return (
                  <div key={r.country_code} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 110px', gap: 10, alignItems: 'center', padding: '4px 0', fontSize: 11 }}>
                    <span style={{ color: 'var(--text-primary)' }}>
                      <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{r.country_code}</span>{' '}
                      {r.country_name}
                    </span>
                    <div style={{ background: 'var(--bg-panel)', height: 8, borderRadius: 2, position: 'relative' }}>
                      <div style={{ background: 'linear-gradient(90deg, var(--green), var(--amber), var(--red))', width: `${pct}%`, height: '100%', borderRadius: 2 }} />
                    </div>
                    <span style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                      {((r.co2_kt || 0) / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} Mt
                    </span>
                  </div>
                )
              })
            })()}
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.5 }}>
              CO₂ emissions in kilotons, World Bank indicator EN.ATM.CO2E.KT. Same Unity Catalog governance plane as
              the ADME data — grants, tags, and column masks apply uniformly.
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            CO₂ data isn't wired yet. Install the World Bank CO₂ Marketplace listing and grant the app SP SELECT.
          </div>
        )}
      </Panel>
    </div>
  )
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  } catch { return iso.slice(11, 16) }
}

function Kpi({ label, value, sub, color }: { label: string; value: any; sub: string; color: string }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>
    </div>
  )
}

function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} style={{
          height: 12, borderRadius: 4, background: 'var(--bg-panel)',
          opacity: 0.4 + (i % 2) * 0.2,
        }} />
      ))}
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

// ── Persona masking · live side-by-side proof (S3 money shot) ────────────────
interface MaskWell { well_id: string; well_name?: any; lat?: any; lon?: any; api_number?: any; status?: any }
interface MaskView { label?: string; wells?: MaskWell[]; visible_count?: number; total_count?: number; redacted_count?: number }
const MASK_COLS: { key: keyof MaskWell; label: string }[] = [
  { key: 'well_name', label: 'well_name' },
  { key: 'lat', label: 'lat' },
  { key: 'lon', label: 'lon' },
  { key: 'api_number', label: 'api_number' },
  { key: 'status', label: 'status' },
]
function isRedacted(v: any) { return typeof v === 'string' && v.includes('redacted') }

function PersonaMaskProof() {
  const [op, setOp] = useState<MaskView | null>(null)
  const [ext, setExt] = useState<MaskView | null>(null)
  useEffect(() => {
    fetch('/api/governance/view/operator').then(r => r.json()).then(setOp).catch(() => {})
    fetch('/api/governance/view/external_partner').then(r => r.json()).then(setExt).catch(() => {})
  }, [])

  const opWells = (op?.wells || []).slice(0, 6)
  const extById = new Map((ext?.wells || []).map(w => [w.well_id, w]))

  const cell = (v: any) => {
    if (v == null || v === '') return <span style={{ color: 'var(--text-muted)' }}>—</span>
    if (isRedacted(v)) return <span style={{ color: '#E74C3C', fontWeight: 600 }}>🔒 masked</span>
    return <span style={{ color: 'var(--text-secondary)' }}>{String(v)}</span>
  }

  const Table = ({ title, sub, color, rows, isExt }: { title: string; sub: string; color: string; rows: MaskWell[]; isExt: boolean }) => (
    <div style={{ flex: 1, minWidth: 0, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderLeft: `3px solid ${color}`, borderRadius: 6, overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 700, fontSize: 12.5, color }}>{title}</div>
        <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{sub}</div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5, fontFamily: 'monospace' }}>
          <thead><tr>
            <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>well_id</th>
            {MASK_COLS.map(c => <th key={c.label} style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>{c.label}</th>)}
          </tr></thead>
          <tbody>
            {rows.map(opw => {
              const w = isExt ? extById.get(opw.well_id) : opw
              const hiddenByFilter = isExt && !w
              return (
                <tr key={opw.well_id} style={{ opacity: hiddenByFilter ? 0.4 : 1 }}>
                  <td style={{ padding: '4px 8px', color: 'var(--blue)' }}>{opw.well_id}</td>
                  {hiddenByFilter ? (
                    <td colSpan={MASK_COLS.length} style={{ padding: '4px 8px', color: '#E74C3C' }}>⛔ row hidden by JV row-filter</td>
                  ) : (
                    MASK_COLS.map(c => <td key={c.label} style={{ padding: '4px 8px' }}>{cell(w?.[c.key])}</td>)
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <Panel title="Persona masking · live proof"
           subtitle="The SAME query, two personas — Unity Catalog column masks + row filters. Genie and the Supervisor run as the signed-in user, so AI answers inherit exactly this.">
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Table title="Drilling Operator" sub="allowed_fields = all · full PII" color="#27AE60" rows={opWells} isExt={false} />
        <Table title="External Partner (JV)" sub={`lat / lon / api masked · row-filtered${ext ? ` · ${ext.redacted_count ?? 0} rows hidden` : ''}`} color="#E74C3C" rows={opWells} isExt={true} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.5 }}>
        Left is the operator view. Right is the JV partner asking the identical question — lat, lon, and API number come back
        masked, and rows outside their entitlement are dropped by the row filter. No app logic decides this at query time; it is
        the Unity Catalog grant bound to the persona, and it applies to Genie's SQL and the Supervisor's tool calls the same way.
      </div>
    </Panel>
  )
}

// Real Foundation Model endpoints available in the workspace (databricks-* served entities).
const MODEL_CHOICES = [
  { id: 'databricks-claude-sonnet-4-5', label: 'Claude Sonnet 4.5', note: 'balanced · current default', family: 'Anthropic' },
  { id: 'databricks-claude-opus-4-8',   label: 'Claude Opus 4.8',   note: 'deepest reasoning',          family: 'Anthropic' },
  { id: 'databricks-claude-haiku-4-5',  label: 'Claude Haiku 4.5',  note: 'fastest · cheapest',         family: 'Anthropic' },
  { id: 'databricks-gpt-oss-120b',      label: 'GPT-OSS 120B',      note: 'open weights',               family: 'Open' },
  { id: 'databricks-llama-4-maverick',  label: 'Llama 4 Maverick',  note: 'open weights',               family: 'Open' },
  { id: 'databricks-qwen35-122b-a10b',  label: 'Qwen 3.5 122B',     note: 'open weights',               family: 'Open' },
]

function ControlCostChoice() {
  const [model, setModel] = useState('databricks-claude-sonnet-4-5')
  const [saving, setSaving] = useState(false)
  const col = { control: '#E74C3C', cost: '#F39C12', choice: '#4dabf7' }

  useEffect(() => {
    fetch('/api/model').then(r => r.json()).then(d => { if (d.model) setModel(d.model) }).catch(() => {})
  }, [])

  function pick(m: string) {
    const prev = model
    setModel(m); setSaving(true)
    fetch('/api/model', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: m }) })
      .then(r => r.json()).then(d => { if (!d.ok) setModel(prev) })
      .catch(() => setModel(prev))
      .finally(() => setSaving(false))
  }
  return (
    <Panel title="Control · Cost · Choice — the open platform for Data + AI"
           subtitle="Governance, spend visibility, and model freedom for every agent and user. The Supervisor and Genie call a governed endpoint behind Mosaic AI Gateway — swap the model without touching code.">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.1fr', gap: 12 }}>

        {/* CONTROL */}
        <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderLeft: `3px solid ${col.control}`, borderRadius: 4, padding: '12px 14px' }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: col.control, letterSpacing: '0.04em', marginBottom: 8 }}>CONTROL</div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <li>Safety + PII guardrails on every prompt &amp; response</li>
            <li>Agents run as the user (OBO) — not a privileged SP</li>
            <li>UC row filters + column masks apply to AI answers too</li>
            <li>Full lineage + audit of every table an agent reads</li>
          </ul>
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {['safety', 'pii_detection', 'OBO', 'UC lineage'].map(t => (
              <span key={t} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'var(--bg-card)', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{t}</span>
            ))}
          </div>
        </div>

        {/* COST */}
        <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderLeft: `3px solid ${col.cost}`, borderRadius: 4, padding: '12px 14px' }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: col.cost, letterSpacing: '0.04em', marginBottom: 8 }}>COST</div>
          {[
            ['Rate limit', '50 QPM · 100K TPM'],
            ['Pricing', 'pay-per-token · no idle GPU'],
            ['Usage tracking', 'per user + per app'],
            ['Budget alerts', 'on spend thresholds'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-muted)' }}>{k}</span>
              <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{v}</span>
            </div>
          ))}
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
            Enforced + metered by Mosaic AI Gateway. Same plane governs the SQL warehouse spend.
          </div>
        </div>

        {/* CHOICE */}
        <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderLeft: `3px solid ${col.choice}`, borderRadius: 4, padding: '12px 14px' }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: col.choice, letterSpacing: '0.04em', marginBottom: 4 }}>CHOICE</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 8 }}>Pick the model — the Gateway routes to it, no code change:</div>
          <div style={{ display: 'grid', gap: 4, maxHeight: 168, overflowY: 'auto' }}>
            {MODEL_CHOICES.map(m => {
              const active = m.id === model
              return (
                <button key={m.id} onClick={() => pick(m.id)} disabled={saving} style={{
                  textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                  background: active ? 'var(--blue-dim)' : 'var(--bg-card)',
                  border: `1px solid ${active ? col.choice : 'var(--border)'}`, borderRadius: 4, padding: '5px 9px',
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: 4, background: active ? col.choice : 'var(--text-muted)', flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: active ? col.choice : 'var(--text-primary)' }}>{m.label}</span>
                    <span style={{ display: 'block', fontSize: 9.5, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{m.id} · {m.note}</span>
                  </span>
                  <span style={{ fontSize: 8.5, color: m.family === 'Open' ? '#27AE60' : '#9254de', fontWeight: 700 }}>{m.family}</span>
                </button>
              )
            })}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
            Active: <span style={{ color: col.choice, fontFamily: 'monospace' }}>{model}</span>{saving ? ' · saving…' : ''} · the Supervisor now calls this endpoint. Anthropic + open-weight, one governed API.
          </div>
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.5 }}>
        Switch persona below and ask the Genie sidebar the same question — masked columns (lat, lon, api_number) stay
        masked in the AI answer, because the model queries through the user's Unity Catalog grants, not a privileged
        service account.
      </div>
    </Panel>
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
