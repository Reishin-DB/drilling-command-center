import { useEffect, useMemo, useState } from 'react'
import SpatialWellsMap from './SpatialWellsMap'
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts'

interface OverviewProps {
  onOpenWell: (id: string, tab?: string) => void
}

interface Well {
  well_id: string
  well_name: string
  basin?: string
  status?: string
  quality_score: number
  lat: number | null
  lon: number | null
  total_depth_ft: number
  anomaly_count: number
  critical_count: number
}

interface EconSummary {
  wti_spot: number
  total_npv_live_musd: number
  total_capex_musd: number
  total_co2_tonnes_yr: number
  wells: { npv10_live_musd: number }[]
}

interface Alert { well_id: string; well_name: string; severity: 'critical'|'warn'|'info'; kind: string; msg: string; ts?: string|null }
interface LastDecision { verdict?: string; well_id?: string; well_name?: string; basin?: string; ts?: number; total_ms?: number; text?: string; empty?: boolean }

export default function OverviewTab({ onOpenWell }: OverviewProps) {
  const [wells, setWells] = useState<Well[]>([])
  const [econ,  setEcon]  = useState<EconSummary | null>(null)
  const [prices, setPrices] = useState<{ date: string; price: number }[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [lastDecision, setLastDecision] = useState<LastDecision | null>(null)

  // Each feed loads on its own so one slow or failing endpoint never blanks the page.
  useEffect(() => {
    const get = (u: string) => fetch(u).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
    get('/api/wells').then(w => setWells(Array.isArray(w) ? w : [])).catch(() => {})
    get('/api/economics/summary').then(setEcon).catch(() => {})
    get('/api/economics/prices').then(p => setPrices(Array.isArray(p) ? p : [])).catch(() => {})
    get('/api/wells/alerts').then(a => setAlerts(a.alerts || [])).catch(() => {})
    get('/api/supervisor/last_decision').then(setLastDecision).catch(() => setLastDecision({ empty: true }))
  }, [])

  // Operator's fleet = the LAS wells in North America. ADME is the global
  // field/analog catalog the Supervisor pulls from.
  const operatorWells = useMemo(() => wells.filter(w => !w.well_id.startsWith('OSDU-')), [wells])
  const gold = operatorWells.filter(w => w.status === 'gold').length
  const corrected = operatorWells.filter(w => w.status === 'corrected').length
  const critical = operatorWells.reduce((s, w) => s + (w.critical_count || 0), 0)
  const avgQ = operatorWells.length ? operatorWells.reduce((s, w) => s + (w.quality_score || 0), 0) / operatorWells.length : 0
  const admeAnalogs = wells.filter(w => w.well_id.startsWith('OSDU-')).length

  const priceWindow = prices.slice(-120)


  const criticalCount = alerts.filter(a => a.severity === 'critical').length
  const verdictColor: Record<string, string> = {
    DRILL: '#2fd39b', HOLD: '#f5a524', 'DE-SCOPE': '#e07b39', ABANDON: '#ff3621', REVIEW: '#4fb3e8',
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
        <Kpi label="Operator fleet" value={`${operatorWells.length}`} sub={`+ ${admeAnalogs} ADME analogs`} color="var(--blue)" />
        <Kpi label="Gold wells" value={`${gold}`} sub={`${corrected} corrected`} color="var(--gold)" />
        <Kpi label="WTI spot" value={econ ? `$${econ.wti_spot.toFixed(2)}` : '…'} sub="FRED live" color="var(--green)" />
        <Kpi label="Portfolio NPV₁₀" value={econ ? `$${econ.total_npv_live_musd.toFixed(0)}M` : '…'} sub={econ ? `CAPEX $${econ.total_capex_musd.toFixed(0)}M` : ''} color="var(--teal)" />
        <Kpi label="Critical alerts" value={`${critical}`} sub={critical > 0 ? '⚠ action needed' : 'all clear'} color={critical > 0 ? 'var(--red)' : 'var(--green)'} />
        <Kpi label="Avg Quality" value={`${avgQ.toFixed(0)}`} sub="out of 100 · QC score" color="var(--purple)" />
      </div>

      {/* Last AI decision + live alerts + WTI */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        <Panel
          title="Last AI decision"
          subtitle={lastDecision && !lastDecision.empty
            ? `Subsurface Supervisor · ${lastDecision.well_id} (${lastDecision.basin || '—'})`
            : 'Subsurface Supervisor · no runs yet'}
        >
          {(!lastDecision || lastDecision.empty) ? (
            <div style={{ fontSize: 18, color: 'var(--text-muted)', padding: '8px 0' }}>
              Run the Subsurface Supervisor to populate this card. The most recent verdict appears here.
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{
                padding: '10px 18px', borderRadius: 8,
                background: verdictColor[lastDecision.verdict || 'REVIEW'] || verdictColor.REVIEW,
                color: 'white', fontSize: 33, fontWeight: 800, letterSpacing: '0.04em',
                boxShadow: `0 4px 18px ${verdictColor[lastDecision.verdict || 'REVIEW']}55`,
                flexShrink: 0,
              }}>{lastDecision.verdict || 'REVIEW'}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 18, color: 'var(--text-primary)', fontWeight: 600 }}>
                  {lastDecision.well_name || lastDecision.well_id}
                </div>
                <div style={{ fontSize: 16.5, color: 'var(--text-muted)', marginTop: 2 }}>
                  synthesised in {lastDecision.total_ms}ms · click below to re-run
                </div>
                <div style={{
                  fontSize: 16.5, color: 'var(--text-secondary)', marginTop: 6,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  overflow: 'hidden', lineHeight: 1.5,
                }}>{(lastDecision.text || '').split('\n')[0]}</div>
              </div>
            </div>
          )}
        </Panel>

        <Panel
          title="Live drilling alerts"
          subtitle={`${alerts.length} active · ${criticalCount} critical · from las.drilling_operations`}
        >
          {alerts.length === 0 ? (
            <div style={{ fontSize: 18, color: 'var(--text-muted)', padding: '8px 0' }}>
              All wells nominal · no NPT, BHA, supply chain, or incident flags.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 5, maxHeight: 130, overflowY: 'auto' }}>
              {alerts.slice(0, 6).map((a, i) => {
                const col = a.severity === 'critical' ? 'var(--red)' :
                            a.severity === 'warn'     ? 'var(--amber)' : 'var(--text-muted)'
                return (
                  <div key={i} onClick={() => onOpenWell(a.well_id, 'viewer')} style={{
                    display: 'grid', gridTemplateColumns: '12px 70px 1fr', gap: 8, alignItems: 'center',
                    padding: '5px 8px', borderRadius: 4,
                    background: 'var(--bg-panel)', border: '1px solid var(--border)',
                    cursor: 'pointer', fontSize: 16.5,
                  }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: 4, background: col,
                      animation: a.severity === 'critical' ? 'genie-pulse 1.1s infinite' : 'none',
                    }} />
                    <span style={{ color: col, fontFamily: 'monospace', fontSize: 15, fontWeight: 600 }}>{a.kind}</span>
                    <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <b style={{ color: 'var(--blue)', fontFamily: 'monospace' }}>{a.well_id}</b> · {a.msg}
                    </span>
                  </div>
                )
              })}
              <style>{`@keyframes genie-pulse { 0%,100% { opacity:.35 } 50% { opacity:1 } }`}</style>
            </div>
          )}
        </Panel>
        <Panel title="WTI · last 120 days" subtitle="FRED DCOILWTICO (fallback if egress blocked)">
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={priceWindow}>
              <defs>
                <linearGradient id="wtiGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--gold)" stopOpacity="0.6" />
                  <stop offset="1" stopColor="var(--gold)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" hide />
              <YAxis tick={{ fontSize: 13.5, fill: 'var(--text-muted)' }} width={40} />
              <Tooltip contentStyle={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', fontSize: 16.5 }} />
              <Area type="monotone" dataKey="price" stroke="var(--gold)" strokeWidth={2} fill="url(#wtiGrad)" />
            </AreaChart>
          </ResponsiveContainer>
          {econ && (
            <div style={{ fontSize: 16.5, color: 'var(--text-muted)', marginTop: 6 }}>
              Spot <b style={{ color: 'var(--gold)' }}>${econ.wti_spot.toFixed(2)}</b> · portfolio re-rated to <b style={{ color: 'var(--green)' }}>${econ.total_npv_live_musd.toFixed(0)}M</b>
            </div>
          )}
        </Panel>
      </div>

      <SpatialWellsMap wells={operatorWells} onOpenWell={onOpenWell} />

      {/* Ingest pipeline */}
      <Panel title="OSDU Ingest Pipeline" subtitle="Medallion flow: live OSDU → Bronze → Silver → Gold → Serving">
        <svg width="100%" viewBox="0 0 1280 210" style={{ display: 'block' }}>
          <defs>
            <linearGradient id="flow" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#4fb3e8" stopOpacity="0" />
              <stop offset="0.5" stopColor="#4fb3e8" stopOpacity="1" />
              <stop offset="1" stopColor="#4fb3e8" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[
            { x: 20,   label: 'ADME / OSDU',   sub: 'opendes partition',         color: '#2fd39b', badge: 'SOURCE' },
            { x: 280,  label: 'Bronze',        sub: 'bronze_wellbore · raw',     color: '#e07b39', badge: 'BRONZE' },
            { x: 540,  label: 'Silver',        sub: 'silver_wellbore · cleaned', color: '#a6b7c2', badge: 'SILVER' },
            { x: 800,  label: 'Gold',          sub: 'wellbore_search_source',    color: '#f5a524', badge: 'GOLD' },
            { x: 1060, label: 'Vector Search', sub: 'subsurface-vs · gte-large', color: '#4fb3e8', badge: 'SERVING' },
          ].map((n, i, arr) => (
            <g key={n.label}>
              {i < arr.length - 1 && (
                <>
                  <line x1={n.x + 200} y1="70" x2={arr[i+1].x} y2="70" stroke="#223d4f" strokeWidth="1" strokeDasharray="4 3" />
                  <circle cx={n.x + 200} cy="70" r="2.5" fill="#4fb3e8">
                    <animate attributeName="cx" values={`${n.x + 200};${arr[i+1].x}`} dur="2.5s" repeatCount="indefinite" begin={`${i * 0.5}s`} />
                    <animate attributeName="opacity" values="0;1;0" dur="2.5s" repeatCount="indefinite" begin={`${i * 0.5}s`} />
                  </circle>
                </>
              )}
              <rect x={n.x} y="20" width="200" height="100" rx="6" fill="var(--bg-panel)" stroke={n.color} strokeWidth="1.5" />
              <text x={n.x + 100} y="48" textAnchor="middle" fill={n.color} fontSize="11" fontWeight="700" fontFamily="monospace" letterSpacing="1">{n.badge}</text>
              <text x={n.x + 100} y="76" textAnchor="middle" fill="var(--text-primary)" fontSize="14" fontWeight="600">{n.label}</text>
              <text x={n.x + 100} y="100" textAnchor="middle" fill="var(--text-muted)" fontSize="10" fontFamily="monospace">{n.sub}</text>
            </g>
          ))}
          <text x="640" y="170" textAnchor="middle" fill="var(--text-muted)" fontSize="12" fontStyle="italic">
            Auto Loader → Delta Live Tables → Vector Search Δ-Sync · governed by Unity Catalog row filters + column masks
          </text>
        </svg>
      </Panel>

      {/* Well list with drill-in */}
      <Panel title="Fleet status" subtitle="Click a row to open the Log Viewer · operator wells in NA + ADME analog wells from the global OSDU catalog">
        <div style={{ overflow: 'auto', maxHeight: 420 }}>
          <table style={{ width: '100%', fontSize: 18, borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)' }}>
              <tr>
                {['Well', 'Name', 'Basin', 'Status', 'Quality', 'TD (ft)', 'Anomalies', 'Critical', 'Source'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {wells.map(w => {
                const isOsdu = w.well_id.startsWith('OSDU-')
                return (
                  <tr key={w.well_id} onClick={() => onOpenWell(w.well_id, 'viewer')}
                      style={{ cursor: 'pointer', borderBottom: '1px solid var(--border-dim)' }}>
                    <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: 'var(--blue)' }}>{w.well_id}</td>
                    <td style={{ padding: '7px 10px' }}>{w.well_name}</td>
                    <td style={{ padding: '7px 10px' }}>{w.basin || '—'}</td>
                    <td style={{ padding: '7px 10px' }}>
                      <Pill value={w.status} />
                    </td>
                    <td style={{ padding: '7px 10px', color: w.quality_score >= 80 ? 'var(--green)' : w.quality_score >= 60 ? 'var(--amber)' : 'var(--red)' }}>
                      {w.quality_score}
                    </td>
                    <td style={{ padding: '7px 10px', fontFamily: 'monospace' }}>{w.total_depth_ft?.toLocaleString()}</td>
                    <td style={{ padding: '7px 10px' }}>{w.anomaly_count}</td>
                    <td style={{ padding: '7px 10px', color: w.critical_count > 0 ? 'var(--red)' : 'var(--text-muted)', fontWeight: w.critical_count > 0 ? 600 : 400 }}>
                      {w.critical_count}
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      <span style={{
                        fontSize: 15, padding: '2px 7px', borderRadius: 10,
                        background: isOsdu ? 'var(--blue-dim)' : 'var(--bg-panel)',
                        color: isOsdu ? 'var(--blue)' : 'var(--text-muted)',
                      }}>{isOsdu ? 'ADME live' : 'Operator'}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <SpatialSQLPanel />
    </div>
  )
}

// ── Spatial SQL · GA — real H3 + ST_ queries over operator_wells ────────────
interface SpatialResult { key: string; title: string; description: string; sql: string; rows: any[]; error: string | null }
function SpatialSQLPanel() {
  const [results, setResults] = useState<SpatialResult[]>([])
  const [fns, setFns] = useState<string[]>([])
  const [active, setActive] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch('/api/geospatial/spatial-sql').then(r => r.json()).then(d => {
      if (d.error) { setErr(d.error); return }
      setResults(d.results || []); setFns(d.functions || [])
      setActive((d.results || [])[0]?.key || '')
    }).catch(e => setErr(String(e))).finally(() => setLoading(false))
  }, [])

  const cur = results.find(r => r.key === active)
  const cols = cur && cur.rows.length ? Object.keys(cur.rows[0]) : []

  return (
    <Panel title="Spatial SQL · GA" subtitle="Real Databricks H3 + ST_ spatial functions over the live OSDU well set">
      {loading && <div style={{ fontSize: 18, color: 'var(--text-muted)' }}>Running spatial queries…</div>}
      {err && <div style={{ fontSize: 18, color: 'var(--red)' }}>{err}</div>}
      {!loading && !err && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {results.map(r => (
              <button key={r.key} onClick={() => setActive(r.key)} style={{
                fontSize: 16.5, padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
                background: active === r.key ? 'var(--blue-dim)' : 'var(--bg-panel)',
                color: active === r.key ? 'var(--blue)' : 'var(--text-muted)',
                border: `1px solid ${active === r.key ? 'var(--blue)' : 'var(--border)'}`,
              }}>{r.title}</button>
            ))}
          </div>
          {cur && (
            <>
              <div style={{ fontSize: 16.5, color: 'var(--text-muted)', marginBottom: 8 }}>{cur.description}</div>
              <pre style={{
                fontFamily: 'monospace', fontSize: 15.8, color: 'var(--text-secondary)', background: 'var(--bg-panel)',
                border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', margin: 0,
                whiteSpace: 'pre-wrap', maxHeight: 120, overflowY: 'auto',
              }}>{cur.sql}</pre>
              {cur.error ? (
                <div style={{ fontSize: 16.5, color: 'var(--red)', marginTop: 8 }}>{cur.error}</div>
              ) : (
                <div style={{ maxHeight: 180, overflowY: 'auto', marginTop: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 16.5 }}>
                    <thead><tr>{cols.map(c => (
                      <th key={c} style={{ textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, padding: '3px 6px', borderBottom: '1px solid var(--border)', fontFamily: 'monospace' }}>{c}</th>
                    ))}</tr></thead>
                    <tbody>
                      {cur.rows.slice(0, 12).map((row, i) => (
                        <tr key={i}>{cols.map(c => (
                          <td key={c} style={{ color: 'var(--text-secondary)', padding: '3px 6px', fontFamily: 'monospace' }}>{String(row[c])}</td>
                        ))}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          {fns.length > 0 && (
            <div style={{ fontSize: 15, color: 'var(--text-muted)', marginTop: 10, fontFamily: 'monospace' }}>functions: {fns.join(' · ')}</div>
          )}
        </>
      )}
    </Panel>
  )
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '12px 14px',
    }}>
      <div style={{ fontSize: 15, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 33, fontWeight: 700, color, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 15, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>
    </div>
  )
}

function Pill({ value }: { value?: string }) {
  const color = value === 'gold' ? 'var(--green)' : value === 'corrected' ? 'var(--amber)' : value === 'raw' ? 'var(--red)' : 'var(--text-muted)'
  const bg = value === 'gold' ? 'var(--green-dim)' : value === 'corrected' ? 'var(--amber-dim)' : value === 'raw' ? 'var(--red-dim)' : 'var(--bg-panel)'
  return <span style={{ fontSize: 15, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: bg, color }}>{value || '—'}</span>
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 600, fontSize: 19.5, color: 'var(--text-primary)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 16.5, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}
