import { useEffect, useState } from 'react'

// Prices the voxel model's step-out: offset type curve scaled by the HCPT ratio,
// valued with the certified UC functions. GET /api/voxels/stepout_value/{well}.

interface Case { capex_musd: number; opex_musd_yr: number; decline_pct_yr: number; wti: number; peak_rate_bopd: number; npv10_musd: number; break_even_wti: number | null; irr_pct: number | null; payback_years: number | null }
export interface StepOutValue {
  field: string; basin: string; offset_well: string
  hcpt: { offset_ft: number; stepout_ft: number; risked_ft: number; scale: number; risked_scale: number; uncertainty: number }
  location: { lat: number; lon: number; distance_ft: number }
  wti: number; wti_date: string | null
  cases: { offset: Case; stepout: Case; risked: Case }
  priced_by: 'uc_function' | 'python_fallback'; pricing_error: string | null; sql: string; method: string
  error?: string
}

export function useStepOutValue(wellId: string) {
  const [v, setV] = useState<StepOutValue | null>(null)
  useEffect(() => {
    setV(null)
    fetch(`/api/voxels/stepout_value/${encodeURIComponent(wellId)}`).then(r => r.ok ? r.json() : null).then(d => setV(d && !d.error ? d : null)).catch(() => {})
  }, [wellId])
  return v
}

const usd = (m: number) => `${m < 0 ? '−' : ''}$${Math.abs(m).toFixed(1)}M`

export default function StepOutValueCard({ wellId, onNavigate }: { wellId: string; onNavigate?: (tab: string) => void }) {
  const v = useStepOutValue(wellId)
  const [showSql, setShowSql] = useState(false)
  if (!v) return (
    <div className="card" style={{ padding: '16px 20px', display: 'flex', gap: 10, alignItems: 'center', color: 'var(--text-muted)', fontSize: 16 }}>
      <span className="spinner" /> Pricing the proposed step-out with the certified NPV function…
    </div>
  )
  const { offset, stepout, risked } = v.cases
  const cols: [string, Case, string][] = [
    [`Offset · ${v.offset_well}`, offset, 'var(--text-secondary)'],
    ['Step-out · unrisked', stepout, 'var(--amber)'],
    ['Step-out · risked', risked, 'var(--text-primary)'],
  ]
  return (
    <div className="card" style={{ padding: '16px 20px', borderColor: '#f5a52466', background: 'linear-gradient(90deg, #f5a52410, transparent 70%)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <div className="label" style={{ fontSize: 13.5 }}>Value the step-out · {v.field} field</div>
          <div style={{ fontSize: 19.5, lineHeight: 1.45, marginTop: 4 }}>
            The proposed well is worth <b style={{ color: 'var(--amber)' }}>{usd(stepout.npv10_musd)}</b> NPV10 unrisked and <b>{usd(risked.npv10_musd)}</b> risked at ${v.wti.toFixed(2)} WTI,
            {' '}{risked.break_even_wti != null && <>breaking even at <b>${risked.break_even_wti.toFixed(0)}</b> on the risked case.</>}
          </div>
        </div>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {v.priced_by === 'uc_function'
            ? <span className="cs-prov cs-prov-live" title="calculate_npv10 and calculate_break_even ran on the SQL warehouse">Live · certified UC function</span>
            : <span className="cs-prov cs-prov-ill" title={v.pricing_error || ''}>Fallback · same formula in app</span>}
          <button className="cs-btn" onClick={() => setShowSql(s => !s)}>{showSql ? 'Hide' : 'Show'} SQL</button>
          {onNavigate && <button className="cs-btn cs-btn-primary" onClick={() => onNavigate('supervisor')}>Decide with AI →</button>}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {cols.map(([label, c, color]) => (
          <div key={label} style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--bg-panel)', border: '1px solid var(--border-dim)' }}>
            <div className="label" style={{ fontSize: 12.5 }}>{label}</div>
            <div style={{ fontSize: 30, fontWeight: 700, color }}>{usd(c.npv10_musd)}</div>
            <div style={{ fontSize: 14.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              IRR {c.irr_pct != null ? `${c.irr_pct.toFixed(0)}%` : '–'} · payback {c.payback_years != null ? `${c.payback_years} yr` : '>10 yr'} · break-even {c.break_even_wti != null ? `$${c.break_even_wti.toFixed(0)}` : '–'}
            </div>
            <div className="mono" style={{ fontSize: 13, color: 'var(--text-muted)' }}>peak {Math.round(c.peak_rate_bopd).toLocaleString()} bopd · capex ${c.capex_musd}M</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 12, fontSize: 14.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
        <div>
          <b style={{ color: 'var(--text-primary)' }}>How it is priced.</b> The offset's type curve is scaled by hydrocarbon pore thickness: {v.hcpt.stepout_ft} ft at the step-out vs {v.hcpt.offset_ft} ft at {v.offset_well} ({v.hcpt.scale.toFixed(2)}x), or {v.hcpt.risked_ft} ft risked ({v.hcpt.risked_scale.toFixed(2)}x).
          Capex, opex and decline are the offset's. Both wells are then priced from scratch by <span className="mono">calculate_npv10</span> and <span className="mono">calculate_break_even</span>, so the comparison is like for like.
        </div>
        <div>
          <span className="cs-prov cs-prov-live">Live</span> HCPT from the voxel model, WTI, the certified functions.{' '}
          <span className="cs-prov cs-prov-ill">Illustrative</span> same well design and cost as the offset; productivity proportional to HCPT.
          The portfolio table below prices every well the same way, so {v.offset_well} shows the same {usd(offset.npv10_musd)} there.
        </div>
      </div>
      {showSql && <pre className="mono" style={{ marginTop: 12, fontSize: 13.5, background: 'var(--bg-panel)', border: '1px solid var(--border-dim)', borderRadius: 6, padding: 12, whiteSpace: 'pre-wrap', color: 'var(--teal)' }}>{'-- the unrisked step-out case\n' + v.sql}</pre>}
    </div>
  )
}
