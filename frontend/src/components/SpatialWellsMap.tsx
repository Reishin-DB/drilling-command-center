import { useEffect, useMemo, useState } from 'react'
import { ComposableMap, Geographies, Geography, Marker, Line, ZoomableGroup } from 'react-simple-maps'
import statesTopo from 'us-atlas/states-10m.json'

// Spatial wells: the operator fleet on a deep-water basemap, with the Spatial SQL
// layers (basin AOI hulls, nearest-offset spacing) and the voxel model's proposed
// step-out per field. Markers are counter-scaled so they stay crisp at any zoom.

export interface MapWell {
  well_id: string; well_name: string; basin?: string; status?: string
  quality_score: number; lat: number | null; lon: number | null; total_depth_ft: number
  anomaly_count: number; critical_count: number
}
interface Aoi { basin: string; wells: number; km2: number; centroid: number[]; ring: number[][] }
interface Pair { well_id: string; nn: string; km: number; from: number[]; to: number[] }
interface StepOut {
  field: string; basin: string; anchor_well: string; nearest_well: string; control_wells: string[]
  lat: number; lon: number; hcpt_ft: number; risked_hcpt_ft: number; control_mean_hcpt_ft: number; nearest_well_ft: number; uncertainty: number
}

const CUSHING: [number, number] = [-96.7686, 35.9848]
const BASIN_COLORS = ['#4fb3e8', '#2fd39b', '#f5a524', '#b79bff', '#9fcd3f', '#ff8a75']
const STATUS: Record<string, { color: string; label: string }> = {
  gold:        { color: '#2fd39b', label: 'Gold · fully processed' },
  corrected:   { color: '#f5a524', label: 'Corrected' },
  qc_complete: { color: '#4fb3e8', label: 'QC complete' },
  raw:         { color: '#a6b7c2', label: 'Raw · not yet QC’d' },
}
const CRITICAL = '#ff3621'
const wellColor = (w: MapWell) => (w.critical_count > 0 ? CRITICAL : STATUS[w.status || '']?.color || '#a6b7c2')

export default function SpatialWellsMap({ wells, onOpenWell }: { wells: MapWell[]; onOpenWell: (id: string, tab?: string) => void }) {
  const [aoi, setAoi] = useState<Aoi[]>([])
  const [pairs, setPairs] = useState<Pair[]>([])
  const [steps, setSteps] = useState<StepOut[]>([])
  const [layers, setLayers] = useState({ aoi: true, spacing: true, stepouts: true, hub: true })
  const [selected, setSelected] = useState<string>('')
  const [view, setView] = useState<{ center: [number, number]; zoom: number } | null>(null)

  useEffect(() => {
    fetch('/api/geospatial/aoi').then(r => r.json()).then(d => setAoi(d.features || [])).catch(() => {})
    fetch('/api/geospatial/spacing').then(r => r.json()).then(d => setPairs(d.pairs || [])).catch(() => {})
    fetch('/api/voxels/stepouts').then(r => r.json()).then(d => setSteps(d.stepouts || [])).catch(() => {})
  }, [])

  const placed = useMemo(() => wells.filter(w => w.lat != null && w.lon != null), [wells])
  useEffect(() => { if (!selected && placed.length) setSelected(placed[0].well_id) }, [placed, selected])

  // Whole-fleet framing, used on load and by "All fleet".
  const fleetView = useMemo(() => {
    if (!placed.length) return { center: [-98, 38] as [number, number], zoom: 1 }
    const lats = placed.map(w => w.lat!), lons = placed.map(w => w.lon!)
    const center: [number, number] = [(Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2]
    const span = Math.max(Math.max(...lons) - Math.min(...lons), Math.max(...lats) - Math.min(...lats), 4)
    return { center, zoom: Math.min(8, Math.max(1.4, 19 / span)) }
  }, [placed])
  const v = view || fleetView
  const k = 1 / v.zoom   // counter-scale for marker geometry

  const aoiGeo = useMemo(() => ({
    type: 'FeatureCollection',
    features: aoi.map((f, i) => ({ type: 'Feature', properties: { ci: i }, geometry: { type: 'Polygon', coordinates: [f.ring] } })),
  }), [aoi])

  const fields = useMemo(() => steps.map(s => ({ ...s, wells: placed.filter(w => s.control_wells.includes(w.well_id)) })), [steps, placed])
  const focus = (f: typeof fields[number]) => {
    const lats = [f.lat, ...f.wells.map(w => w.lat!)], lons = [f.lon, ...f.wells.map(w => w.lon!)]
    const span = Math.max(Math.max(...lons) - Math.min(...lons), Math.max(...lats) - Math.min(...lats), 0.02)
    setView({ center: [(Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2], zoom: Math.min(600, 9 / span) })
    setSelected(f.anchor_well)
  }

  const sel = placed.find(w => w.well_id === selected)
  const selPair = pairs.find(p => p.well_id === selected)
  const selStep = steps.find(s => s.control_wells.includes(selected))
  const zoomedIn = v.zoom > 60

  const toggle = (key: keyof typeof layers) => setLayers(l => ({ ...l, [key]: !l[key] }))

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontSize: 19.5, fontWeight: 700 }}>Spatial wells</div>
          <div style={{ fontSize: 14.5, color: 'var(--text-muted)' }}>{placed.length} operator wells · Databricks Spatial SQL layers over <span className="mono">operator_wells</span> · step-outs from the voxel model</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <LayerChip on={layers.aoi} color="#4fb3e8" onClick={() => toggle('aoi')}>Basin AOI · ST_ConvexHull</LayerChip>
          <LayerChip on={layers.spacing} color="#9fd4f2" onClick={() => toggle('spacing')}>Spacing · ST_Distance</LayerChip>
          <LayerChip on={layers.stepouts} color="#f5a524" onClick={() => toggle('stepouts')}>Step-outs · voxel model</LayerChip>
          <LayerChip on={layers.hub} color="#ffd666" onClick={() => toggle('hub')}>Cushing hub</LayerChip>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', height: 440 }}>
        <div style={{ position: 'relative', overflow: 'hidden', background: 'radial-gradient(ellipse at 40% 30%, #0f2534 0%, #081520 70%)' }}>
          {/* Field focus */}
          <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 2, display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: '90%' }}>
            <FocusChip active={!view} onClick={() => setView(null)}>All fleet</FocusChip>
            {fields.map(f => <FocusChip key={f.field} active={!!view && selStep?.field === f.field} onClick={() => focus(f)}>{f.field}</FocusChip>)}
          </div>

          <ComposableMap projection="geoAlbersUsa" projectionConfig={{ scale: 1000 }} width={900} height={440} style={{ width: '100%', height: '100%', display: 'block' }}>
            <ZoomableGroup center={v.center} zoom={v.zoom} minZoom={1} maxZoom={800}
              onMoveEnd={({ coordinates, zoom }: { coordinates: [number, number]; zoom: number }) => setView({ center: coordinates, zoom })}>
              <Geographies geography={statesTopo}>
                {({ geographies }) => geographies.map(geo => (
                  <Geography key={geo.rsmKey} geography={geo} style={{
                    default: { fill: '#10232f', stroke: '#24435a', strokeWidth: 0.6 * k, outline: 'none' },
                    hover:   { fill: '#132a38', stroke: '#2b5068', strokeWidth: 0.6 * k, outline: 'none' },
                    pressed: { fill: '#132a38', stroke: '#2b5068', strokeWidth: 0.6 * k, outline: 'none' },
                  }} />
                ))}
              </Geographies>

              {layers.aoi && aoi.length > 0 && (
                <Geographies geography={aoiGeo as any}>
                  {({ geographies }) => geographies.map((geo, i) => {
                    const c = BASIN_COLORS[((geo.properties?.ci as number) ?? i) % BASIN_COLORS.length]
                    return <Geography key={geo.rsmKey || i} geography={geo} style={{
                      default: { fill: c, fillOpacity: 0.1, stroke: c, strokeWidth: 1.2 * k, strokeDasharray: `${5 * k} ${3 * k}`, outline: 'none' },
                      hover:   { fill: c, fillOpacity: 0.18, stroke: c, strokeWidth: 1.4 * k, outline: 'none' },
                      pressed: { fill: c, fillOpacity: 0.18, stroke: c, strokeWidth: 1.4 * k, outline: 'none' },
                    }} />
                  })}
                </Geographies>
              )}
              {layers.aoi && aoi.map((f, i) => f.centroid && (
                <Marker key={`aoi-${i}`} coordinates={f.centroid as [number, number]}>
                  <text y={-16 * k} textAnchor="middle" fontSize={9 * k} fontWeight={700} fill={BASIN_COLORS[i % BASIN_COLORS.length]}
                    style={{ paintOrder: 'stroke', stroke: '#081520', strokeWidth: 3 * k, letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: 'IBM Plex Sans' }}>
                    {f.basin} · {f.km2.toLocaleString()} km²
                  </text>
                </Marker>
              ))}

              {layers.spacing && pairs.map((p, i) => (
                <g key={`sp-${i}`}>
                  <Line from={p.from as [number, number]} to={p.to as [number, number]} stroke="#9fd4f2" strokeOpacity={0.7} strokeWidth={1 * k} strokeDasharray={`${3 * k} ${2.5 * k}`} />
                  {zoomedIn && (
                    <Marker coordinates={[(p.from[0] + p.to[0]) / 2, (p.from[1] + p.to[1]) / 2]}>
                      <text textAnchor="middle" fontSize={8 * k} fill="#9fd4f2" style={{ paintOrder: 'stroke', stroke: '#081520', strokeWidth: 2.5 * k, fontFamily: 'IBM Plex Mono' }}>{p.km} km</text>
                    </Marker>
                  )}
                </g>
              ))}

              {layers.hub && (
                <Marker coordinates={CUSHING}>
                  <rect x={-4 * k} y={-4 * k} width={8 * k} height={8 * k} transform="rotate(45)" fill="#ffd666" stroke="#081520" strokeWidth={1 * k} />
                  <text x={9 * k} y={3 * k} fontSize={8 * k} fontWeight={600} fill="#ffd666" style={{ paintOrder: 'stroke', stroke: '#081520', strokeWidth: 2.5 * k, fontFamily: 'IBM Plex Sans' }}>Cushing · WTI hub</text>
                </Marker>
              )}

              {layers.stepouts && steps.map(s => {
                const nw = placed.find(w => w.well_id === s.nearest_well)
                return (
                  <g key={`so-${s.field}`}>
                    {nw && <Line from={[nw.lon!, nw.lat!]} to={[s.lon, s.lat]} stroke="#f5a524" strokeWidth={1.2 * k} strokeDasharray={`${2 * k} ${2 * k}`} />}
                    <Marker coordinates={[s.lon, s.lat]} onClick={() => { setSelected(s.anchor_well) }} style={{ default: { cursor: 'pointer' } }}>
                      <circle r={11 * k} fill="none" stroke="#f5a524" strokeWidth={1 * k} opacity={0.6}>
                        <animate attributeName="r" values={`${7 * k};${14 * k};${7 * k}`} dur="2.2s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.7;0;0.7" dur="2.2s" repeatCount="indefinite" />
                      </circle>
                      <rect x={-4.5 * k} y={-4.5 * k} width={9 * k} height={9 * k} transform="rotate(45)" fill="#f5a524" stroke="#081520" strokeWidth={1 * k} />
                      {zoomedIn && <text x={10 * k} y={12 * k} fontSize={8.5 * k} fontWeight={700} fill="#f5a524" style={{ paintOrder: 'stroke', stroke: '#081520', strokeWidth: 2.5 * k, fontFamily: 'IBM Plex Sans' }}>Step-out · {s.hcpt_ft} ft HCPT</text>}
                    </Marker>
                  </g>
                )
              })}

              {placed.map(w => {
                const c = wellColor(w), active = w.well_id === selected
                return (
                  <Marker key={w.well_id} coordinates={[w.lon!, w.lat!]} onClick={() => setSelected(w.well_id)} style={{ default: { cursor: 'pointer' } }}>
                    {active && <circle r={13 * k} fill="none" stroke="#ffffff" strokeWidth={1.2 * k} opacity={0.85} />}
                    <circle r={9 * k} fill={c} opacity={0.16} />
                    <circle r={5.5 * k} fill="#081520" stroke={c} strokeWidth={1.6 * k} />
                    <circle r={2.6 * k} fill={c}>
                      {w.critical_count > 0 && <animate attributeName="opacity" values="0.4;1;0.4" dur="1.2s" repeatCount="indefinite" />}
                    </circle>
                    <g transform={`translate(${10 * k}, ${-6 * k})`} style={{ pointerEvents: 'none' }}>
                      <rect width={(w.well_id.length * 5.4 + 8) * k} height={12 * k} rx={2.5 * k} fill="#081520" fillOpacity={0.85} stroke={active ? '#ffffff' : c} strokeOpacity={active ? 0.9 : 0.45} strokeWidth={0.7 * k} />
                      <text x={4 * k} y={8.6 * k} fontSize={8.4 * k} fill={active ? '#ffffff' : '#dce8ef'} style={{ fontFamily: 'IBM Plex Mono', fontWeight: 500 }}>{w.well_id}</text>
                    </g>
                  </Marker>
                )
              })}
            </ZoomableGroup>
          </ComposableMap>

          <div style={{ position: 'absolute', left: 12, bottom: 12, display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13.5, color: 'var(--text-secondary)', background: '#081520d9', border: '1px solid var(--border-dim)', borderRadius: 6, padding: '6px 10px' }}>
            {Object.entries(STATUS).map(([key, s]) => <LegendDot key={key} color={s.color}>{s.label.split(' · ')[0]}</LegendDot>)}
            <LegendDot color={CRITICAL}>Critical alert</LegendDot>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ width: 9, height: 9, background: '#f5a524', transform: 'rotate(45deg)' }} />Proposed step-out</span>
          </div>
          <div style={{ position: 'absolute', right: 12, bottom: 12, fontSize: 13, color: 'var(--text-muted)' }}>scroll to zoom · drag to pan · pick a field to fly in</div>
        </div>

        {/* Inspector */}
        <div style={{ borderLeft: '1px solid var(--border)', padding: 14, display: 'grid', gap: 12, alignContent: 'start', background: 'var(--bg-card)', overflowY: 'auto' }}>
          {sel ? <>
            <div>
              <div className="label" style={{ fontSize: 12.5 }}>Selected well</div>
              <div className="mono" style={{ fontSize: 22.5, fontWeight: 600, color: 'var(--text-primary)' }}>{sel.well_id}</div>
              <div style={{ fontSize: 15.8, color: 'var(--text-secondary)' }}>{sel.well_name} · {sel.basin}</div>
              <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span className="badge" style={{ color: wellColor(sel), border: `1px solid ${wellColor(sel)}`, background: `${wellColor(sel)}1f`, fontSize: 13 }}>{STATUS[sel.status || '']?.label || sel.status}</span>
                {sel.critical_count > 0 && <span className="badge badge-red" style={{ fontSize: 13 }}>{sel.critical_count} critical</span>}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Stat label="Quality" value={`${sel.quality_score}/100`} />
              <Stat label="TD" value={`${sel.total_depth_ft.toLocaleString()} ft`} />
              <Stat label="Nearest offset" value={selPair ? `${selPair.km} km` : '–'} sub={selPair?.nn} />
              <Stat label="Location" value={`${sel.lat!.toFixed(3)}, ${sel.lon!.toFixed(3)}`} mono />
            </div>
            {selStep && (
              <div style={{ padding: 12, borderRadius: 8, border: '1px solid #f5a52466', background: '#f5a52412' }}>
                <div className="label" style={{ fontSize: 12.5, color: 'var(--amber)' }}>Voxel model · {selStep.field} step-out</div>
                <div style={{ fontSize: 16.5, lineHeight: 1.5, marginTop: 4 }}>
                  <b style={{ color: 'var(--amber)' }}>{selStep.hcpt_ft} ft</b> HCPT vs {selStep.control_mean_hcpt_ft} ft at control, {selStep.nearest_well_ft.toLocaleString()} ft from {selStep.nearest_well}. Risked {selStep.risked_hcpt_ft} ft.
                </div>
              </div>
            )}
            <div style={{ display: 'grid', gap: 8 }}>
              <button className="cs-btn" onClick={() => onOpenWell(sel.well_id, 'viewer')}>Read the logs →</button>
              <button className="cs-btn cs-btn-primary" onClick={() => onOpenWell(sel.well_id, '3d')}>Open the voxel model →</button>
            </div>
          </> : <div style={{ color: 'var(--text-muted)', fontSize: 16 }}>Select a well on the map.</div>}

          {aoi.length > 0 && (
            <div>
              <div className="label" style={{ fontSize: 12.5, marginBottom: 6 }}>Basin footprints</div>
              {aoi.map((f, i) => (
                <div key={f.basin} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, padding: '5px 0', borderTop: i ? '1px solid var(--border-dim)' : 0 }}>
                  <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: BASIN_COLORS[i % BASIN_COLORS.length], marginRight: 8 }} />{f.basin}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{f.wells} wells · {f.km2.toLocaleString()} km²</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function LayerChip({ on, color, onClick, children }: { on: boolean; color: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 7, padding: '5px 11px', borderRadius: 20, fontSize: 13.5, fontWeight: 600,
      border: `1px solid ${on ? color : 'var(--border)'}`, background: on ? `${color}1c` : 'transparent', color: on ? 'var(--text-primary)' : 'var(--text-muted)',
    }}>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: on ? color : 'var(--border)' }} />{children}
    </button>
  )
}

function FocusChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 12px', borderRadius: 6, fontSize: 13.5, fontWeight: 600,
      border: `1px solid ${active ? 'var(--amber)' : 'var(--border)'}`, background: active ? 'var(--amber-dim)' : '#081520d9',
      color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
    }}>{children}</button>
  )
}

function LegendDot({ color, children }: { color: string; children: React.ReactNode }) {
  return <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ width: 9, height: 9, borderRadius: 5, border: `1.5px solid ${color}`, background: '#081520', boxShadow: `inset 0 0 0 2px ${color}` }} />{children}</span>
}

function Stat({ label, value, sub, mono }: { label: string; value: string; sub?: string; mono?: boolean }) {
  return (
    <div style={{ padding: '8px 10px', background: 'var(--bg-panel)', border: '1px solid var(--border-dim)', borderRadius: 6 }}>
      <div className="label" style={{ fontSize: 11.5 }}>{label}</div>
      <div className={mono ? 'mono' : undefined} style={{ fontSize: mono ? 14.5 : 17, fontWeight: 600 }}>{value}</div>
      {sub && <div className="mono" style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  )
}
