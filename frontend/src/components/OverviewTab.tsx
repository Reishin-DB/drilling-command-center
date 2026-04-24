import { useEffect, useState } from 'react'
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

export default function OverviewTab({ onOpenWell }: OverviewProps) {
  const [wells, setWells] = useState<Well[]>([])
  const [econ,  setEcon]  = useState<EconSummary | null>(null)
  const [prices, setPrices] = useState<{ date: string; price: number }[]>([])

  useEffect(() => {
    ;(async () => {
      const [w, e, p] = await Promise.all([
        fetch('/api/wells').then(r => r.json()),
        fetch('/api/economics/summary').then(r => r.json()),
        fetch('/api/economics/prices').then(r => r.json()),
      ])
      setWells(w)
      setEcon(e)
      setPrices(p)
    })()
  }, [])

  const gold = wells.filter(w => w.status === 'gold').length
  const corrected = wells.filter(w => w.status === 'corrected').length
  const critical = wells.reduce((s, w) => s + (w.critical_count || 0), 0)
  const avgQ = wells.length ? wells.reduce((s, w) => s + (w.quality_score || 0), 0) / wells.length : 0
  const osdu = wells.filter(w => w.well_id.startsWith('OSDU-')).length

  const priceWindow = prices.slice(-120)

  // Map bounds — compute from well lat/lon (rough Mercator rectangle)
  const withCoord = wells.filter(w => w.lat != null && w.lon != null) as Required<Well>[]
  const lats = withCoord.map(w => w.lat!)
  const lons = withCoord.map(w => w.lon!)
  const latMin = Math.min(...lats, 20), latMax = Math.max(...lats, 65)
  const lonMin = Math.min(...lons, -120), lonMax = Math.max(...lons, 10)
  const mapW = 900, mapH = 300
  const project = (lat: number, lon: number) => {
    const x = ((lon - lonMin) / (lonMax - lonMin)) * (mapW - 40) + 20
    const y = ((latMax - lat) / (latMax - latMin)) * (mapH - 40) + 20
    return { x, y }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
        <Kpi label="Fleet" value={`${wells.length}`} sub={`${osdu} OSDU · ${wells.length - osdu} operator`} color="var(--blue)" />
        <Kpi label="Gold wells" value={`${gold}`} sub={`${corrected} corrected`} color="var(--gold)" />
        <Kpi label="WTI spot" value={econ ? `$${econ.wti_spot.toFixed(2)}` : '…'} sub="FRED live" color="var(--green)" />
        <Kpi label="Portfolio NPV₁₀" value={econ ? `$${econ.total_npv_live_musd.toFixed(0)}M` : '…'} sub={econ ? `CAPEX $${econ.total_capex_musd.toFixed(0)}M` : ''} color="var(--teal)" />
        <Kpi label="Critical alerts" value={`${critical}`} sub={critical > 0 ? '⚠ action needed' : 'all clear'} color={critical > 0 ? 'var(--red)' : 'var(--green)'} />
        <Kpi label="Avg Quality" value={`${avgQ.toFixed(0)}`} sub="out of 100 · QC score" color="var(--purple)" />
      </div>

      {/* Map + WTI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <Panel title="Fleet locations" subtitle={`${withCoord.length} wells with coordinates · green=gold, amber=corrected, red=critical alerts`}>
          <svg width="100%" viewBox={`0 0 ${mapW} ${mapH}`} style={{
            background: 'var(--bg-primary)', borderRadius: 6, border: '1px solid var(--border-dim)',
          }}>
            {/* Grid */}
            {[...Array(10)].map((_, i) => (
              <line key={`v${i}`} x1={(mapW / 10) * i} y1={0} x2={(mapW / 10) * i} y2={mapH} stroke="var(--border-dim)" strokeWidth="0.5" />
            ))}
            {[...Array(6)].map((_, i) => (
              <line key={`h${i}`} x1={0} y1={(mapH / 6) * i} x2={mapW} y2={(mapH / 6) * i} stroke="var(--border-dim)" strokeWidth="0.5" />
            ))}
            {withCoord.map(w => {
              const { x, y } = project(w.lat!, w.lon!)
              const color = w.critical_count > 0 ? 'var(--red)' : w.status === 'gold' ? 'var(--green)' : 'var(--amber)'
              return (
                <g key={w.well_id} style={{ cursor: 'pointer' }} onClick={() => onOpenWell(w.well_id, 'viewer')}>
                  <circle cx={x} cy={y} r="6" fill={color} opacity="0.25" />
                  <circle cx={x} cy={y} r="3.5" fill={color}>
                    <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" />
                  </circle>
                  <text x={x + 7} y={y + 3} fontSize="9" fill="var(--text-primary)" fontFamily="monospace">
                    {w.well_id}
                  </text>
                </g>
              )
            })}
            <text x={10} y={mapH - 10} fill="var(--text-muted)" fontSize="10" fontFamily="monospace">
              lat {latMin.toFixed(1)}–{latMax.toFixed(1)} · lon {lonMin.toFixed(1)}–{lonMax.toFixed(1)}
            </text>
          </svg>
        </Panel>

        <Panel title="WTI · last 120 days" subtitle="FRED DCOILWTICO (fallback if egress blocked)">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={priceWindow}>
              <defs>
                <linearGradient id="wtiGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--gold)" stopOpacity="0.6" />
                  <stop offset="1" stopColor="var(--gold)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" hide />
              <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} width={40} />
              <Tooltip contentStyle={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', fontSize: 11 }} />
              <Area type="monotone" dataKey="price" stroke="var(--gold)" strokeWidth={2} fill="url(#wtiGrad)" />
            </AreaChart>
          </ResponsiveContainer>
          {econ && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              Spot <b style={{ color: 'var(--gold)' }}>${econ.wti_spot.toFixed(2)}</b> · portfolio re-rated to <b style={{ color: 'var(--green)' }}>${econ.total_npv_live_musd.toFixed(0)}M</b>
            </div>
          )}
        </Panel>
      </div>

      {/* Well list with drill-in */}
      <Panel title="Fleet status" subtitle="Click a row to open the Log Viewer">
        <div style={{ overflow: 'auto', maxHeight: 420 }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
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
                        fontSize: 10, padding: '2px 7px', borderRadius: 10,
                        background: isOsdu ? 'var(--blue-dim)' : 'var(--bg-panel)',
                        color: isOsdu ? 'var(--blue)' : 'var(--text-muted)',
                      }}>{isOsdu ? 'OSDU live' : 'Operator'}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '12px 14px',
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>
    </div>
  )
}

function Pill({ value }: { value?: string }) {
  const color = value === 'gold' ? 'var(--green)' : value === 'corrected' ? 'var(--amber)' : value === 'raw' ? 'var(--red)' : 'var(--text-muted)'
  const bg = value === 'gold' ? 'var(--green-dim)' : value === 'corrected' ? 'var(--amber-dim)' : value === 'raw' ? 'var(--red-dim)' : 'var(--bg-panel)'
  return <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: bg, color }}>{value || '—'}</span>
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}
