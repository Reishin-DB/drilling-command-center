import { useEffect, useMemo, useState } from 'react'
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts'
import { ComposableMap, Geographies, Geography, Marker, Line, Annotation, ZoomableGroup } from 'react-simple-maps'
import statesTopo from 'us-atlas/states-10m.json'

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

  useEffect(() => {
    ;(async () => {
      const [w, e, p, a, ld] = await Promise.all([
        fetch('/api/wells').then(r => r.json()),
        fetch('/api/economics/summary').then(r => r.json()),
        fetch('/api/economics/prices').then(r => r.json()),
        fetch('/api/wells/alerts').then(r => r.json()).catch(() => ({ alerts: [] })),
        fetch('/api/supervisor/last_decision').then(r => r.json()).catch(() => ({ empty: true })),
      ])
      setWells(w)
      setEcon(e)
      setPrices(p)
      setAlerts(a.alerts || [])
      setLastDecision(ld)
    })()
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

  const withCoord = operatorWells.filter(w => w.lat != null && w.lon != null) as Required<Well>[]

  // Auto-fit US states map to operator fleet bounds (geoAlbersUsa projection).
  const mapCenter = useMemo<[number, number]>(() => {
    if (withCoord.length === 0) return [-98, 38]
    const cLat = withCoord.reduce((s, w) => s + w.lat!, 0) / withCoord.length
    const cLon = withCoord.reduce((s, w) => s + w.lon!, 0) / withCoord.length
    return [cLon, cLat]
  }, [withCoord])
  const mapZoom = useMemo(() => {
    if (withCoord.length < 2) return 3.5
    const lats = withCoord.map(w => w.lat!)
    const lons = withCoord.map(w => w.lon!)
    const spanLon = Math.max(...lons) - Math.min(...lons)
    const spanLat = Math.max(...lats) - Math.min(...lats)
    const span = Math.max(spanLon, spanLat, 4)
    return Math.min(8, Math.max(2, 40 / span))
  }, [withCoord])

  const criticalCount = alerts.filter(a => a.severity === 'critical').length
  const verdictColor: Record<string, string> = {
    DRILL: '#27AE60', HOLD: '#F39C12', 'DE-SCOPE': '#CD6116', ABANDON: '#E74C3C', REVIEW: '#4dabf7',
  }

  // Per-basin AOI footprints — tight buffered convex hull of the wells (ST_ConvexHull
  // + ST_Buffer + ST_Area). Hugs the wells instead of covering the whole map.
  const [showAoi, setShowAoi] = useState(true)
  const BASIN_COLORS = ['#4dabf7', '#27AE60', '#F39C12', '#b37feb', '#22d3ee', '#e46b8b']
  const [aoiFeat, setAoiFeat] = useState<{ basin: string; wells: number; km2: number; centroid: number[] }[]>([])
  const [aoiGeo, setAoiGeo] = useState<any>({ type: 'FeatureCollection', features: [] })
  useEffect(() => {
    fetch('/api/geospatial/aoi').then(r => r.json()).then(d => {
      const feats = (d.features || [])
      setAoiFeat(feats)
      setAoiGeo({
        type: 'FeatureCollection',
        features: feats.map((f: any, i: number) => ({
          type: 'Feature', properties: { basin: f.basin, km2: f.km2, wells: f.wells, ci: i },
          geometry: { type: 'Polygon', coordinates: [f.ring] },
        })),
      })
    }).catch(() => {})
  }, [])

  // Well spacing — nearest offset well per well via ST_Distance. On by default
  // so the geospatial (Spatial SQL GA) story is visible on load.
  const [showSpacing, setShowSpacing] = useState(true)
  const [spacing, setSpacing] = useState<{ well_id: string; nn: string; km: number; from: number[]; to: number[] }[]>([])
  useEffect(() => {
    fetch('/api/geospatial/spacing').then(r => r.json()).then(d => setSpacing(d.pairs || [])).catch(() => {})
  }, [])

  const CUSHING: [number, number] = [-96.7686, 35.9848]  // WTI pricing hub

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

      {/* Last AI decision + Live alerts ticker */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Panel
          title="Last AI decision"
          subtitle={lastDecision && !lastDecision.empty
            ? `Subsurface Supervisor · ${lastDecision.well_id} (${lastDecision.basin || '—'})`
            : 'Subsurface Supervisor · no runs yet'}
        >
          {(!lastDecision || lastDecision.empty) ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
              Run the Subsurface Supervisor to populate this card. The most recent verdict appears here.
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{
                padding: '10px 18px', borderRadius: 8,
                background: verdictColor[lastDecision.verdict || 'REVIEW'] || verdictColor.REVIEW,
                color: 'white', fontSize: 22, fontWeight: 800, letterSpacing: '0.04em',
                boxShadow: `0 4px 18px ${verdictColor[lastDecision.verdict || 'REVIEW']}55`,
                flexShrink: 0,
              }}>{lastDecision.verdict || 'REVIEW'}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>
                  {lastDecision.well_name || lastDecision.well_id}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  synthesised in {lastDecision.total_ms}ms · click below to re-run
                </div>
                <div style={{
                  fontSize: 11, color: 'var(--text-secondary)', marginTop: 6,
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
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
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
                    cursor: 'pointer', fontSize: 11,
                  }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: 4, background: col,
                      animation: a.severity === 'critical' ? 'genie-pulse 1.1s infinite' : 'none',
                    }} />
                    <span style={{ color: col, fontFamily: 'monospace', fontSize: 10, fontWeight: 600 }}>{a.kind}</span>
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
      </div>

      {/* Map + WTI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <Panel title="Operator fleet locations" subtitle={`${withCoord.length} wells in NA · green=gold, amber=corrected, red=critical alerts · click a well to open Log Viewer`}>
          <div style={{
            background: 'var(--bg-primary)', borderRadius: 6, border: '1px solid var(--border-dim)',
            position: 'relative', overflow: 'hidden',
          }}>
            <ComposableMap projection="geoAlbersUsa" projectionConfig={{ scale: 1000 }} width={900} height={420} style={{ width: '100%', height: 'auto', display: 'block' }}>
              <ZoomableGroup center={mapCenter} zoom={mapZoom} minZoom={1} maxZoom={12}>
                <Geographies geography={statesTopo}>
                  {({ geographies }) =>
                    geographies.map(geo => (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        style={{
                          default: { fill: '#1a1f2b', stroke: '#3a4254', strokeWidth: 0.5, outline: 'none' },
                          hover:   { fill: '#222a3a', stroke: '#4a5468', strokeWidth: 0.5, outline: 'none' },
                          pressed: { fill: '#222a3a', stroke: '#4a5468', strokeWidth: 0.5, outline: 'none' },
                        }}
                      />
                    ))
                  }
                </Geographies>
                {/* Per-basin AOI footprints — tight buffered convex hull (ST_ConvexHull + ST_Buffer) */}
                {showAoi && aoiGeo.features.length > 0 && (
                  <>
                    <Geographies geography={aoiGeo as any}>
                      {({ geographies }) =>
                        geographies.map((geo, i) => {
                          const c = BASIN_COLORS[((geo.properties?.ci as number) ?? i) % BASIN_COLORS.length]
                          return (
                            <Geography key={geo.rsmKey || i} geography={geo}
                              style={{
                                default: { fill: c, fillOpacity: 0.14, stroke: c, strokeWidth: 1.2, strokeDasharray: '5 3', outline: 'none' },
                                hover:   { fill: c, fillOpacity: 0.24, stroke: c, strokeWidth: 1.4, strokeDasharray: '5 3', outline: 'none' },
                                pressed: { fill: c, fillOpacity: 0.24, stroke: c, strokeWidth: 1.4, outline: 'none' },
                              }} />
                          )
                        })
                      }
                    </Geographies>
                    {aoiFeat.map((f, i) => f.centroid && (
                      <Annotation key={`aoi-lbl-${i}`} subject={f.centroid as [number, number]} dx={0} dy={0} connectorProps={{}}>
                        <text textAnchor="middle" fontSize={7.5} fontWeight={700} fontFamily="monospace"
                              fill={BASIN_COLORS[i % BASIN_COLORS.length]}
                              style={{ paintOrder: 'stroke', stroke: '#0d1117', strokeWidth: 2.4 }}>
                          {f.basin} · {f.km2.toLocaleString()} km²
                        </text>
                      </Annotation>
                    ))}
                  </>
                )}
                {/* Well spacing — nearest-offset lines (ST_Distance) */}
                {showSpacing && spacing.map((s, i) => (
                  <Line key={`sp-${i}`} from={s.from as [number, number]} to={s.to as [number, number]}
                        stroke="#e46b8b" strokeWidth={0.9} strokeLinecap="round" strokeDasharray="3 2" />
                ))}
                {/* Cushing, OK — WTI physical pricing hub (ST_Distance reference) */}
                <Marker coordinates={CUSHING}>
                  <rect x={-3.5} y={-3.5} width={7} height={7} transform="rotate(45)" fill="#F5D90A" stroke="#0d1117" strokeWidth={0.8} />
                  <text x={7} y={3} fontSize={7} fontWeight={700} fill="#F5D90A" fontFamily="monospace"
                        style={{ pointerEvents: 'none', paintOrder: 'stroke', stroke: '#0d1117', strokeWidth: 2.2 }}>Cushing · WTI hub</text>
                </Marker>
                {withCoord.map(w => {
                  const color = w.critical_count > 0 ? '#E74C3C' : w.status === 'gold' ? '#27AE60' : '#F39C12'
                  return (
                    <Marker key={w.well_id} coordinates={[w.lon!, w.lat!]} onClick={() => onOpenWell(w.well_id, 'viewer')} style={{ default: { cursor: 'pointer' } }}>
                      <circle r={9} fill={color} opacity={0.18} />
                      <circle r={5} fill={color} opacity={0.45} />
                      <circle r={2.8} fill={color}>
                        <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" />
                      </circle>
                      <text x={9} y={3} fontSize={7} fill="var(--text-primary)" fontFamily="monospace" style={{ pointerEvents: 'none' }}>
                        {w.well_id}
                      </text>
                    </Marker>
                  )
                })}
              </ZoomableGroup>
            </ComposableMap>
            <div style={{
              position: 'absolute', top: 10, right: 10, fontSize: 10, fontFamily: 'monospace',
              background: 'rgba(13,17,23,0.85)', border: '1px solid var(--border-dim)', borderRadius: 4,
              padding: '6px 9px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 3,
            }}>
              <div><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: '#27AE60', marginRight: 6 }} />gold</div>
              <div><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: '#F39C12', marginRight: 6 }} />corrected</div>
              <div><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: '#E74C3C', marginRight: 6 }} />critical</div>
              <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid var(--border-dim)', fontSize: 9, color: '#8794ad' }}>SPATIAL SQL (GA)</div>
              <button onClick={() => setShowAoi(v => !v)} style={{
                marginTop: 2, background: showAoi ? '#4dabf722' : 'transparent', color: showAoi ? '#4dabf7' : 'var(--text-muted)',
                border: `1px solid ${showAoi ? '#4dabf7' : 'var(--border)'}`, borderRadius: 4, padding: '2px 8px', fontSize: 9, cursor: 'pointer', textAlign: 'left',
              }}>{showAoi ? 'Basin AOI on' : 'Basin AOI off'} · ConvexHull+Buffer</button>
              <button onClick={() => setShowSpacing(v => !v)} style={{
                marginTop: 2, background: showSpacing ? '#e46b8b22' : 'transparent', color: showSpacing ? '#e46b8b' : 'var(--text-muted)',
                border: `1px solid ${showSpacing ? '#e46b8b' : 'var(--border)'}`, borderRadius: 4, padding: '2px 8px', fontSize: 9, cursor: 'pointer', textAlign: 'left',
              }}>{showSpacing ? 'Spacing on' : 'Spacing off'} · ST_Distance</button>
              <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid var(--border-dim)' }}>scroll to zoom · drag to pan · ◆ Cushing = WTI hub</div>
            </div>
          </div>
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

      {/* Ingest pipeline */}
      <Panel title="OSDU Ingest Pipeline" subtitle="Medallion flow: live OSDU → Bronze → Silver → Gold → Serving">
        <svg width="100%" viewBox="0 0 1280 210" style={{ display: 'block' }}>
          <defs>
            <linearGradient id="flow" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#00E5FF" stopOpacity="0" />
              <stop offset="0.5" stopColor="#00E5FF" stopOpacity="1" />
              <stop offset="1" stopColor="#00E5FF" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[
            { x: 20,   label: 'ADME / OSDU',   sub: 'opendes partition',         color: '#27AE60', badge: 'SOURCE' },
            { x: 280,  label: 'Bronze',        sub: 'bronze_wellbore · raw',     color: '#CD6116', badge: 'BRONZE' },
            { x: 540,  label: 'Silver',        sub: 'silver_wellbore · cleaned', color: '#8E9AAF', badge: 'SILVER' },
            { x: 800,  label: 'Gold',          sub: 'wellbore_search_source',    color: '#F39C12', badge: 'GOLD' },
            { x: 1060, label: 'Vector Search', sub: 'subsurface-vs · gte-large', color: '#00E5FF', badge: 'SERVING' },
          ].map((n, i, arr) => (
            <g key={n.label}>
              {i < arr.length - 1 && (
                <>
                  <line x1={n.x + 200} y1="70" x2={arr[i+1].x} y2="70" stroke="#2a2e3a" strokeWidth="1" strokeDasharray="4 3" />
                  <circle cx={n.x + 200} cy="70" r="2.5" fill="#00E5FF">
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
      {loading && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Running spatial queries…</div>}
      {err && <div style={{ fontSize: 12, color: 'var(--red)' }}>{err}</div>}
      {!loading && !err && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {results.map(r => (
              <button key={r.key} onClick={() => setActive(r.key)} style={{
                fontSize: 11, padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
                background: active === r.key ? 'var(--blue-dim)' : 'var(--bg-panel)',
                color: active === r.key ? 'var(--blue)' : 'var(--text-muted)',
                border: `1px solid ${active === r.key ? 'var(--blue)' : 'var(--border)'}`,
              }}>{r.title}</button>
            ))}
          </div>
          {cur && (
            <>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>{cur.description}</div>
              <pre style={{
                fontFamily: 'monospace', fontSize: 10.5, color: 'var(--text-secondary)', background: 'var(--bg-panel)',
                border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', margin: 0,
                whiteSpace: 'pre-wrap', maxHeight: 120, overflowY: 'auto',
              }}>{cur.sql}</pre>
              {cur.error ? (
                <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 8 }}>{cur.error}</div>
              ) : (
                <div style={{ maxHeight: 180, overflowY: 'auto', marginTop: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
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
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 10, fontFamily: 'monospace' }}>functions: {fns.join(' · ')}</div>
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
