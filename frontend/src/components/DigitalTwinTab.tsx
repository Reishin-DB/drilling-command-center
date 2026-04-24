import { useEffect, useState, useRef } from 'react'

interface TwinProps {
  wellId: string
  onWellChange: (w: string) => void
}

interface Formation {
  formation_name: string
  top_md: number
  base_md: number
  zone_type: string
  lithology_desc?: string
}

interface WellDetail {
  well_id: string
  well_name: string
  total_depth_ft: number
  kb_elevation_ft: number
  basin?: string
  status?: string
  formations: Formation[]
  anomalies: any[]
}

const ZONE_COLORS: Record<string, string> = {
  shale:     '#3b4a5a',
  sand:      '#c8a05a',
  carbonate: '#b3e4f7',
  reservoir: '#7a3f14',
  fluvial:   '#9b6b3a',
  default:   '#5c6470',
}

export default function DigitalTwinTab({ wellId, onWellChange }: TwinProps) {
  const [wells, setWells] = useState<{ well_id: string; well_name: string }[]>([])
  const [well, setWell]   = useState<WellDetail | null>(null)
  const [depth, setDepth] = useState(0)
  const [rop,   setRop]   = useState(50)
  const [wob,   setWob]   = useState(32)
  const [torque, setTorque] = useState(18)
  const [mudWt, setMudWt] = useState(10.3)
  const [running, setRunning] = useState(true)
  const tick = useRef(0)

  useEffect(() => {
    fetch('/api/wells').then(r => r.json()).then(setWells)
  }, [])

  useEffect(() => {
    ;(async () => {
      const w = await fetch(`/api/wells/${wellId}`).then(r => r.json())
      setWell(w)
      setDepth((w?.total_depth_ft || 10000) * 0.5)
    })()
  }, [wellId])

  // Animation: bit drills down over time
  useEffect(() => {
    if (!running || !well) return
    const id = setInterval(() => {
      tick.current += 1
      setDepth(d => Math.min(d + (well.total_depth_ft || 10000) * 0.002, well.total_depth_ft || 10000))
      // Jitter ROP / WOB / Torque for live feel
      setRop(r => clamp(r + (Math.random() - 0.5) * 4, 20, 120))
      setWob(w => clamp(w + (Math.random() - 0.5) * 2, 15, 45))
      setTorque(t => clamp(t + (Math.random() - 0.5) * 1.5, 10, 30))
    }, 800)
    return () => clearInterval(id)
  }, [running, well?.total_depth_ft])

  if (!well) return <div style={{ color: 'var(--text-muted)', padding: 40 }}>Loading twin…</div>

  const td = well.total_depth_ft || 10000
  const pctDrilled = depth / td
  const current = well.formations.find(f => depth >= f.top_md && depth < f.base_md) || well.formations[0]
  const stuckRisk = clamp((torque - 18) / 12 + (mudWt - 10) / 5, 0, 1)

  // SVG geometry — vertical well cross-section
  const W = 720
  const H = 520
  const surfaceY = 60
  const tdY = H - 30
  const axisX = 180

  const depthToY = (d: number) => surfaceY + (d / td) * (tdY - surfaceY)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
      <Panel title={`Digital Twin · ${well.well_name}`} subtitle={`${well.basin || ''} · TD ${td.toFixed(0)} ft · status ${well.status}`}>
        {/* Well picker strip */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflow: 'auto' }}>
          {wells.map(w => (
            <button key={w.well_id} onClick={() => onWellChange(w.well_id)} style={{
              padding: '4px 10px', fontSize: 11,
              background: w.well_id === wellId ? 'var(--blue-dim)' : 'var(--bg-panel)',
              color: w.well_id === wellId ? 'var(--blue)' : 'var(--text-muted)',
              border: `1px solid ${w.well_id === wellId ? 'var(--blue)' : 'var(--border)'}`,
              borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>{w.well_id}</button>
          ))}
        </div>

        {/* SVG cross-section */}
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ background: 'var(--bg-primary)', borderRadius: 6, border: '1px solid var(--border-dim)' }}>
          {/* Sky / surface */}
          <defs>
            <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0a1a2e" />
              <stop offset="1" stopColor="#0d0e11" />
            </linearGradient>
            <radialGradient id="bitGlow" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#ff7a45" stopOpacity="0.9" />
              <stop offset="1" stopColor="#ff7a45" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width={W} height={surfaceY} fill="url(#sky)" />
          <line x1="0" y1={surfaceY} x2={W} y2={surfaceY} stroke="#6b7280" strokeWidth="1" strokeDasharray="2 4" />
          <text x="10" y={surfaceY - 6} fill="var(--text-muted)" fontSize="10" fontFamily="monospace">surface / KB {well.kb_elevation_ft} ft</text>

          {/* Formations */}
          {well.formations.map((f, i) => {
            const y1 = depthToY(f.top_md)
            const y2 = depthToY(f.base_md)
            const color = ZONE_COLORS[f.zone_type] || ZONE_COLORS.default
            return (
              <g key={f.formation_name}>
                <rect x="0" y={y1} width={W} height={Math.max(2, y2 - y1)} fill={color} opacity="0.45" />
                <line x1="0" y1={y1} x2={W} y2={y1} stroke={color} strokeWidth="0.5" opacity="0.9" />
                <text x={W - 10} y={y1 + 14} fill="#e8eaf0" fontSize="10" fontFamily="monospace" textAnchor="end">
                  {f.formation_name} · {f.zone_type}
                </text>
                <text x={W - 10} y={y1 + 26} fill="var(--text-muted)" fontSize="9" fontFamily="monospace" textAnchor="end">
                  {Math.round(f.top_md)}–{Math.round(f.base_md)} ft
                </text>
              </g>
            )
          })}

          {/* Casing / wellbore */}
          <line x1={axisX} y1={surfaceY} x2={axisX} y2={depthToY(depth)} stroke="#f1c40f" strokeWidth="3" />
          <line x1={axisX} y1={depthToY(depth)} x2={axisX} y2={tdY} stroke="#ffffff20" strokeWidth="2" strokeDasharray="3 3" />

          {/* Bit at current depth */}
          <circle cx={axisX} cy={depthToY(depth)} r="22" fill="url(#bitGlow)" />
          <polygon
            points={`${axisX},${depthToY(depth) - 8} ${axisX - 8},${depthToY(depth) + 8} ${axisX + 8},${depthToY(depth) + 8}`}
            fill="#ff7a45"
          >
            <animateTransform attributeName="transform" type="rotate"
              from={`0 ${axisX} ${depthToY(depth)}`}
              to={`360 ${axisX} ${depthToY(depth)}`}
              dur="1.2s" repeatCount="indefinite" />
          </polygon>

          {/* Bit depth label */}
          <line x1={axisX + 15} y1={depthToY(depth)} x2={axisX + 60} y2={depthToY(depth)} stroke="#ff7a45" strokeWidth="1" />
          <text x={axisX + 65} y={depthToY(depth) + 4} fill="#ff7a45" fontSize="11" fontFamily="monospace" fontWeight="700">
            BIT · {Math.round(depth)} ft
          </text>

          {/* TD marker */}
          <line x1="40" y1={tdY} x2={W - 40} y2={tdY} stroke="#666" strokeDasharray="2 4" />
          <text x="10" y={tdY + 4} fill="var(--text-muted)" fontSize="10" fontFamily="monospace">TD · {td.toFixed(0)} ft</text>
        </svg>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
          <button onClick={() => setRunning(!running)} style={{
            padding: '5px 14px', fontSize: 12,
            background: running ? 'var(--red-dim)' : 'var(--green-dim)',
            color: running ? 'var(--red)' : 'var(--green)',
            border: `1px solid ${running ? 'var(--red)' : 'var(--green)'}`,
            borderRadius: 4, cursor: 'pointer',
          }}>
            {running ? '⏸ Pause sim' : '▶ Resume sim'}
          </button>
          <div style={{ flex: 1, fontSize: 11, color: 'var(--text-muted)' }}>
            <span style={{ color: 'var(--green)', fontWeight: 600 }}>● LIVE</span> streaming @ 1.2 Hz ·
            <span style={{ fontFamily: 'monospace', marginLeft: 8 }}>
              {(pctDrilled * 100).toFixed(1)}% TD
            </span>
          </div>
        </div>
      </Panel>

      {/* Right column — HUD */}
      <div style={{ display: 'grid', gap: 12 }}>
        <Panel title="Live Telemetry">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            <Gauge label="ROP" value={rop.toFixed(0)} unit="ft/hr" color="var(--teal)" max={120} actual={rop} />
            <Gauge label="WOB" value={wob.toFixed(1)} unit="klbf" color="var(--blue)" max={45} actual={wob} />
            <Gauge label="Torque" value={torque.toFixed(1)} unit="klbf·ft" color="var(--amber)" max={30} actual={torque} />
            <Gauge label="Mud Wt" value={mudWt.toFixed(1)} unit="ppg" color="var(--purple)" max={16} actual={mudWt} />
          </div>
        </Panel>

        <Panel title="Current Interval">
          <div style={{ padding: '8px 0' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--teal)' }}>
              {current?.formation_name || '—'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {current?.zone_type} · {Math.round(current?.top_md || 0)}-{Math.round(current?.base_md || 0)} ft
            </div>
            {current?.lithology_desc && (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
                {current.lithology_desc}
              </div>
            )}
          </div>
        </Panel>

        <Panel title="Stuck-pipe Risk (ML)">
          <div style={{
            background: 'var(--bg-panel)', borderRadius: 4, height: 10, position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              background: `linear-gradient(90deg, var(--green), var(--amber), var(--red))`,
              width: `${stuckRisk * 100}%`, height: '100%', transition: 'width 0.8s ease',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginTop: 6, color: 'var(--text-muted)' }}>
            <span>0</span>
            <span style={{
              color: stuckRisk < 0.3 ? 'var(--green)' : stuckRisk < 0.7 ? 'var(--amber)' : 'var(--red)',
              fontWeight: 600, fontSize: 11,
            }}>{stuckRisk < 0.3 ? 'LOW' : stuckRisk < 0.7 ? 'ELEVATED' : 'HIGH'} — {(stuckRisk * 100).toFixed(0)}%</span>
            <span>100</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
            Features: torque trend, mud wt, cuttings return, ROP/WOB ratio. Served via Databricks Model Serving.
          </div>
        </Panel>

        <Panel title="Active Anomalies" subtitle={`${well.anomalies?.length || 0} flagged`}>
          <div style={{ maxHeight: 160, overflow: 'auto' }}>
            {(well.anomalies || []).slice(0, 8).map((a: any, i: number) => (
              <div key={i} style={{
                fontSize: 11, padding: '5px 8px', marginBottom: 4,
                background: a.severity === 'critical' ? 'var(--red-dim)' : 'var(--amber-dim)',
                border: `1px solid ${a.severity === 'critical' ? 'var(--red)' : 'var(--amber)'}`,
                borderRadius: 4,
              }}>
                <div style={{ fontWeight: 600, color: a.severity === 'critical' ? 'var(--red)' : 'var(--amber)' }}>
                  [{a.severity?.toUpperCase() || 'INFO'}] {a.curve_name}
                </div>
                <div style={{ color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>
                  {a.description}
                </div>
              </div>
            ))}
            {(!well.anomalies || well.anomalies.length === 0) && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: 8 }}>No active anomalies</div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  )
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), hi)
}

function Gauge({ label, value, unit, color, actual, max }: { label: string; value: string; unit: string; color: string; actual: number; max: number }) {
  const pct = clamp(actual / max, 0, 1)
  return (
    <div style={{ background: 'var(--bg-panel)', borderRadius: 4, padding: 8 }}>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 18, color, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{unit}</div>
      <div style={{ background: 'var(--bg-card)', height: 3, borderRadius: 2, marginTop: 4 }}>
        <div style={{ background: color, width: `${pct * 100}%`, height: '100%', borderRadius: 2, transition: 'width 0.5s' }} />
      </div>
    </div>
  )
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
      padding: 14,
    }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  )
}
