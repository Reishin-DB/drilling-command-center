import { useEffect, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

// Fill the missing sonic: a served model predicts DT from the other curves.
// GET /api/sonic/{well_id} and /api/sonic/metrics.

interface Row { md: number; gr?: number | null; rhob?: number | null; nphi?: number | null; dt_actual?: number | null; dt_model?: number | null; dt_gardner?: number | null }
interface SonicResp { well_id: string; source: 'model' | 'gardner'; endpoint?: string; rows: Row[]; metrics?: any; error?: string; note?: string }

const MISSING_DT_WELL = 'GREENRIVER-03'

// ml/metrics.json from the training job: pooled leave-one-well-out scores per
// method, the champion (the served model), and display labels.
type Score = { key: string; name: string; mae?: number; rmse?: number; r2?: number; served?: boolean }
const ORDER = ['gardner_textbook', 'gardner_calibrated', 'faust_calibrated', 'model', 'linear_all_curves']
function scores(m: any): Score[] {
  if (!m?.pooled) return []
  return ORDER.filter(k => m.pooled[k]).map(k => ({
    key: k, name: m.method_labels?.[k] || k, ...m.pooled[k], served: k === m.champion,
  }))
}

export default function SonicTab({ wellId, onWellChange, onNavigate }: { wellId: string; onWellChange: (w: string) => void; onNavigate: (tab: string) => void }) {
  const [wells, setWells] = useState<{ well_id: string; basin?: string }[]>([])
  const [target, setTarget] = useState(wellId === 'SANJUAN-01' ? MISSING_DT_WELL : wellId)
  const [data, setData] = useState<SonicResp | null>(null)
  const [metrics, setMetrics] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/wells').then(r => r.json()).then(d => setWells((Array.isArray(d) ? d : d.wells || []).filter((w: any) => !w.well_id.startsWith('OSDU-')))).catch(() => {})
    fetch('/api/sonic/metrics').then(r => r.ok ? r.json() : null).then(setMetrics).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true); setData(null)
    fetch(`/api/sonic/${encodeURIComponent(target)}`).then(r => r.ok ? r.json() : { error: `HTTP ${r.status}` })
      .then(d => { setData(d); setLoading(false) }).catch(e => { setData({ well_id: target, source: 'gardner', rows: [], error: String(e) }); setLoading(false) })
  }, [target])

  const pick = (w: string) => { setTarget(w); onWellChange(w) }
  const sc = scores(metrics || data?.metrics)
  const model = sc.find(s => s.served), base = sc.find(s => s.key === 'gardner_calibrated')
  const hasActual = !!data?.rows.some(r => r.dt_actual != null)
  const rows = data?.rows || []
  const m = metrics || data?.metrics
  const nWells = m?.n_wells
  const thisWell = (data as any)?.this_well as { n: number; model_mae: number; gardner_mae: number } | null

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="card" style={{ padding: '16px 20px', display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', borderColor: '#2fd39b55', background: 'linear-gradient(90deg, #2fd39b12, transparent 60%)' }}>
        <div style={{ flex: '1 1 520px' }}>
          <div className="label" style={{ fontSize: 13.5, marginBottom: 6 }}>Fill the missing sonic</div>
          <div style={{ fontSize: 19.5, lineHeight: 1.45 }}>
            <b className="mono" style={{ color: 'var(--blue)' }}>{MISSING_DT_WELL}</b> was logged without a sonic (DT) curve, and geomechanics and seismic ties need one.
            {model && base?.mae != null && model.mae != null
              ? <> On wells held out of training, the served model predicts DT with <b style={{ color: 'var(--green)' }}>{model.mae.toFixed(1)} µs/ft</b> mean error vs <b>{base.mae.toFixed(1)} µs/ft</b> for the Gardner relation calibrated on the same wells, about {(base.mae / model.mae).toFixed(1)}x lower.</>
              : <> A model trained on the wells that do have sonic predicts it from GR, density, neutron and resistivity, and is scored against the Gardner relation used today.</>}
          </div>
        </div>
        <button className="cs-btn cs-btn-primary" onClick={() => onNavigate('3d')}>Model the subsurface →</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 420px', gap: 14 }}>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
            <select value={target} onChange={e => pick(e.target.value)} style={{ padding: '7px 10px', background: 'var(--bg-panel)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 16.5 }}>
              {(wells.length ? wells : [{ well_id: target }]).map(w => <option key={w.well_id} value={w.well_id}>{w.well_id}{w.well_id === MISSING_DT_WELL ? ' · no sonic logged' : ''}</option>)}
            </select>
            {data && (data.source === 'model'
              ? <span className="cs-prov cs-prov-live" title={data.endpoint}>Live · Model Serving{data.endpoint ? ` · ${data.endpoint}` : ''}</span>
              : <span className="cs-prov cs-prov-ill" title={data.note || data.error}>Fallback · Gardner relation</span>)}
            {!hasActual && data && <span className="badge badge-amber">No measured DT: prediction only</span>}
          </div>
          {loading ? <div style={{ height: 640, display: 'grid', placeItems: 'center' }}><span className="spinner" /></div>
            : rows.length === 0 ? <div style={{ height: 200, display: 'grid', placeItems: 'center', color: 'var(--text-muted)', fontSize: 16 }}>{data?.error || 'No samples for this well.'}</div>
            : (
              <ResponsiveContainer width="100%" height={640}>
                <LineChart data={rows} layout="vertical" margin={{ top: 8, right: 20, left: 10, bottom: 8 }}>
                  <CartesianGrid stroke="#182f3e" />
                  <XAxis type="number" domain={['dataMin - 5', 'dataMax + 5']} tick={{ fill: '#a6b7c2', fontSize: 13 }} label={{ value: 'DT µs/ft', position: 'insideBottom', offset: -2, fill: '#6c8494', fontSize: 13 }} />
                  <YAxis type="number" dataKey="md" reversed domain={['dataMin', 'dataMax']} tick={{ fill: '#a6b7c2', fontSize: 13 }} width={60} label={{ value: 'MD ft', angle: -90, position: 'insideLeft', fill: '#6c8494', fontSize: 13 }} />
                  <Tooltip contentStyle={{ background: '#132836', border: '1px solid #223d4f', fontSize: 14 }} formatter={(v: any) => (typeof v === 'number' ? v.toFixed(1) : v)} labelFormatter={(l: any) => `${l} ft`} />
                  <Legend wrapperStyle={{ fontSize: 14 }} />
                  {hasActual && <Line dataKey="dt_actual" name="Measured DT" stroke="#a6b7c2" dot={false} strokeWidth={1.2} isAnimationActive={false} />}
                  <Line dataKey="dt_gardner" name="Gardner baseline" stroke="#b79bff" dot={false} strokeWidth={1.2} strokeDasharray="4 3" isAnimationActive={false} />
                  <Line dataKey="dt_model" name="Model prediction" stroke="#2fd39b" dot={false} strokeWidth={1.8} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
        </div>

        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 17, fontWeight: 700 }}>Evaluation</div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 10 }}>Whole wells held out{nWells ? ` · ${nWells} wells` : ''}: samples from one well share its geology, so a random split would leak.</div>
            {sc.length ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15.8 }}>
                <thead><tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}><th style={th}>Method</th><th style={th}>MAE</th><th style={th}>RMSE</th><th style={th}>R²</th></tr></thead>
                <tbody>{sc.map(s => (
                  <tr key={s.key} style={{ borderTop: '1px solid var(--border-dim)', color: s.served ? 'var(--green)' : 'var(--text-secondary)', fontWeight: s.served ? 600 : 400 }}>
                    <td style={td}>{s.name}{s.served && <span className="cs-prov cs-prov-live" style={{ marginLeft: 6 }}>served</span>}</td><td style={td}>{s.mae?.toFixed(2) ?? '–'}</td><td style={td}>{s.rmse?.toFixed(2) ?? '–'}</td><td style={td}>{s.r2?.toFixed(3) ?? '–'}</td>
                  </tr>))}</tbody>
              </table>
            ) : <div style={{ fontSize: 15, color: 'var(--text-muted)' }}>Metrics appear once the training job has run.</div>}
            <div style={{ fontSize: 13.5, color: 'var(--text-muted)', marginTop: 8 }}>Errors in µs/ft{m?.n_samples ? ` over ${m.n_samples.toLocaleString()} samples` : ''}. Champion rule: {m?.champion_rule || 'lowest held-out MAE'}.</div>
            {thisWell && <div style={{ fontSize: 14.5, marginTop: 8, color: 'var(--text-secondary)' }}>On this well ({thisWell.n.toLocaleString()} samples with measured DT): model {thisWell.model_mae.toFixed(1)} vs Gardner {thisWell.gardner_mae.toFixed(1)} µs/ft.</div>}
          </div>
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>How it is built</div>
            <ol style={{ paddingLeft: 20, fontSize: 15, lineHeight: 1.55, color: 'var(--text-secondary)', display: 'grid', gap: 4 }}>
              <li>Raw LAS-style curves land in a Unity Catalog volume.</li>
              <li>A Lakeflow declarative pipeline QCs them (despike, gaps, range) into silver and computes petrophysics in gold.</li>
              <li>MLflow scores linear and gradient-boosted models on GR, RHOB, NPHI, log RT and depth against Gardner and Faust, and registers the champion in Unity Catalog. The two models tie, so the simpler one is served.</li>
              <li>Model Serving hosts it behind AI Gateway usage tracking; the app calls it as the app service principal and falls back to Gardner, labelled, if the endpoint is cold.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}

const th: React.CSSProperties = { padding: '4px 4px', fontWeight: 600, fontSize: 13, textTransform: 'uppercase', letterSpacing: '.05em' }
const td: React.CSSProperties = { padding: '6px 4px' }
