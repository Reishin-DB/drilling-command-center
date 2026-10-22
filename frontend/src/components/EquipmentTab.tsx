import { useEffect, useMemo, useState } from 'react'

// ── types (mirror server/equipment.py assess_well output) ────────────────────
interface Severity { ppm: number; band: string; label: string; headline: string; tone: string; rank: number }
interface Component {
  id: string; group: string; group_label: string; name: string; baseline: string
  required_spec: string; mechanism: string; risk: number; risk_tone: string
  capex_musd: number; lead_weeks: number; upgrade_required: boolean
}
interface EspRunlife { baseline_months: number; upgraded_months: number; months_lost_if_not_upgraded: number; derate_pct: number }
interface Assessment {
  well_id: string; well_name: string; basin?: string; severity: Severity
  sour_classified: boolean; nace_required: boolean; components: Component[]
  upgrade_count: number; total_capex_musd: number; critical_path_weeks: number
  critical_path_item?: string; esp_runlife: EspRunlife; summary: string
}
interface Rollup {
  well_count: number; sour_count: number; sour_capex_musd: number
  total_capex_musd: number; longest_lead_weeks: number; nace_wells: number
}
interface Fleet { wells: Assessment[]; rollup: Rollup; standard: string }

const TONE_VAR: Record<string, string> = {
  red: 'var(--red)', amber: 'var(--amber)', gold: 'var(--gold)', green: 'var(--green)', blue: 'var(--blue)',
}
const TONE_DIM: Record<string, string> = {
  red: 'var(--red-dim)', amber: 'var(--amber-dim)', gold: 'var(--gold-dim)', green: 'var(--green-dim)', blue: 'var(--blue-dim)',
}
const GROUP_ORDER = ['downhole', 'esp', 'surface']
const GROUP_ICON: Record<string, string> = { downhole: '⛓️', esp: '🛢️', surface: '🏭' }

export default function EquipmentTab({ wellId, onWellChange }: { wellId: string; onWellChange?: (w: string) => void }) {
  const [fleet, setFleet]   = useState<Fleet | null>(null)
  const [selected, setSel]  = useState<string>(wellId)
  const [err, setErr]       = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/equipment/fleet')
      .then(r => r.json())
      .then((d: Fleet) => {
        setFleet(d)
        // Default selection to the most severe well if the active one isn't sour.
        const hit = d.wells.find(w => w.well_id === wellId)
        if (!hit || hit.severity.band === 'sweet') setSel(d.wells[0]?.well_id ?? wellId)
      })
      .catch(e => setErr(String(e)))
  }, [wellId])

  const active = useMemo(
    () => fleet?.wells.find(w => w.well_id === selected) ?? null,
    [fleet, selected],
  )

  function pick(id: string) {
    setSel(id)
    onWellChange?.(id)
  }

  if (err)   return <Card><div style={{ color: 'var(--red)' }}>Failed to load equipment integrity: {err}</div></Card>
  if (!fleet) return <Card><div style={{ color: 'var(--text-muted)' }}>Loading equipment integrity…</div></Card>

  const r = fleet.rollup
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Intro / story */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 21, color: 'var(--text-primary)' }}>
              Oilfield Equipment Integrity, sour-service impact
            </div>
            <div style={{ fontSize: 17.2, color: 'var(--text-muted)', marginTop: 2 }}>
              Once the HSE gate finds H2S, every wetted component inherits a metallurgy consequence. This turns each
              well's governed H2S profile into the equipment it needs, what degrades if it doesn't get it, and the
              cost + lead-time to procure it.
            </div>
          </div>
          <span style={{
            fontSize: 15, fontFamily: 'monospace', color: 'var(--text-muted)',
            border: '1px solid var(--border)', borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap',
          }}>{fleet.standard}</span>
        </div>
      </Card>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
        <Kpi label="Sour wells" value={`${r.sour_count}`} sub={`of ${r.well_count} in fleet`} tone="red" />
        <Kpi label="NACE MR0175 wells" value={`${r.nace_wells}`} sub="require sour metallurgy" tone="amber" />
        <Kpi label="Sour-service capex" value={`$${r.sour_capex_musd.toFixed(1)}M`} sub="premium over sweet baseline" tone="gold" />
        <Kpi label="Longest lead time" value={`${r.longest_lead_weeks} wk`} sub="critical-path procurement" tone="blue" />
        <Kpi label="Fleet capex delta" value={`$${r.total_capex_musd.toFixed(1)}M`} sub="all wells, all components" tone="purple" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 14, alignItems: 'start' }}>
        {/* Fleet list */}
        <Card>
          <SectionLabel>Fleet · by sour severity</SectionLabel>
          <div style={{ display: 'grid', gap: 5, marginTop: 8 }}>
            {fleet.wells.map(w => {
              const on = w.well_id === selected
              const tone = TONE_VAR[w.severity.tone] ?? 'var(--text-muted)'
              return (
                <button key={w.well_id} onClick={() => pick(w.well_id)} style={{
                  textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                  background: on ? 'var(--bg-panel)' : 'var(--bg-card)',
                  border: `1px solid ${on ? tone : 'var(--border)'}`, borderRadius: 6, padding: '8px 10px',
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: 5, background: tone, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>{w.well_name}</span>
                    <span style={{ display: 'block', fontSize: 15, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {w.severity.ppm ? `${w.severity.ppm.toLocaleString()} ppm` : 'no H2S'} · {w.basin ?? '–'}
                    </span>
                  </span>
                  <span style={{
                    fontSize: 13.5, fontWeight: 700, color: tone, background: TONE_DIM[w.severity.tone],
                    border: `1px solid ${tone}`, borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap',
                  }}>{w.severity.label}</span>
                </button>
              )
            })}
          </div>
        </Card>

        {/* Per-well detail */}
        {active ? <WellDetail a={active} /> : <Card><div style={{ color: 'var(--text-muted)' }}>Select a well.</div></Card>}
      </div>

      {/* Methodology footer */}
      <Card>
        <SectionLabel>How this is derived</SectionLabel>
        <div style={{ fontSize: 16.5, color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 8 }}>
          One governed source of truth. The well's H2S profile lives in Unity Catalog (<code>well_h2s_profile</code>);
          a deterministic NACE MR0175 / ISO 15156 engine maps ppm + sour classification to each component's required
          spec, degradation mechanism (SSC · HIC · weight-loss corrosion), capex premium, and lead time. The same
          engine feeds the Subsurface Supervisor's Equipment Integrity gate and the Genie space
          (<code>well_equipment_integrity</code> · <code>f_equipment_spec_for_well</code>), so the tab, the agent, and
          natural-language answers never disagree.
        </div>
      </Card>
    </div>
  )
}

function WellDetail({ a }: { a: Assessment }) {
  const tone = TONE_VAR[a.severity.tone] ?? 'var(--text-muted)'
  const groups = GROUP_ORDER.map(g => ({ g, items: a.components.filter(c => c.group === g) })).filter(x => x.items.length)
  return (
    <Card>
      {/* headline */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', marginBottom: 12,
        background: TONE_DIM[a.severity.tone], border: `1px solid ${tone}`, borderRadius: 6,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 19.5, fontWeight: 700, color: 'var(--text-primary)' }}>
            {a.well_name} <span style={{ color: tone }}>· {a.severity.label}</span>
          </div>
          <div style={{ fontSize: 16.5, color: 'var(--text-secondary)', marginTop: 2 }}>{a.summary}</div>
        </div>
        {a.nace_required && (
          <span style={{ fontSize: 14.2, fontWeight: 700, color: tone, border: `1px solid ${tone}`, borderRadius: 4, padding: '3px 8px', whiteSpace: 'nowrap' }}>
            NACE MR0175
          </span>
        )}
      </div>

      {/* mini stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
        <MiniStat label="H2S measured" value={a.severity.ppm ? `${a.severity.ppm.toLocaleString()} ppm` : '–'} />
        <MiniStat label="Upgrades" value={`${a.upgrade_count} components`} />
        <MiniStat label="Added capex" value={`$${a.total_capex_musd.toFixed(2)}M`} />
        <MiniStat label="Critical lead" value={`${a.critical_path_weeks} wk`} />
      </div>

      {/* component groups */}
      {groups.map(({ g, items }) => (
        <div key={g} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 16.5, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.04em', margin: '4px 0 6px' }}>
            {GROUP_ICON[g]} {items[0].group_label}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {items.map(c => <ComponentRow key={c.id} c={c} />)}
          </div>
        </div>
      ))}

      {/* ESP run-life callout */}
      {a.esp_runlife.months_lost_if_not_upgraded > 0 && (
        <div style={{
          marginTop: 4, padding: '10px 12px', background: 'var(--bg-panel)',
          border: '1px solid var(--border)', borderLeft: '3px solid var(--amber)', borderRadius: 4,
        }}>
          <div style={{ fontSize: 16.5, fontWeight: 700, color: 'var(--amber)', marginBottom: 4 }}>ESP RUN-LIFE IMPACT</div>
          <div style={{ fontSize: 17.2, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            With sour-rated ESP metallurgy + elastomers: <b style={{ color: 'var(--text-primary)' }}>{a.esp_runlife.upgraded_months} mo</b> expected run-life.
            Left as standard build: <b style={{ color: 'var(--red)' }}>{a.esp_runlife.baseline_months} mo</b> ({a.esp_runlife.derate_pct}% derate),
            costing <b style={{ color: 'var(--text-primary)' }}>{a.esp_runlife.months_lost_if_not_upgraded} months</b> of run-life and an extra workover cycle.
          </div>
        </div>
      )}
    </Card>
  )
}

function ComponentRow({ c }: { c: Component }) {
  const tone = TONE_VAR[c.risk_tone] ?? 'var(--text-muted)'
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1.4fr 1.4fr 90px 70px 60px', gap: 10, alignItems: 'center',
      background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 5, padding: '8px 10px',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 17.2, fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</div>
        <div style={{ fontSize: 14.2, color: 'var(--text-muted)' }}>baseline: {c.baseline}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 16.5, color: c.upgrade_required ? tone : 'var(--text-secondary)', fontWeight: c.upgrade_required ? 600 : 400 }}>
          {c.required_spec}
        </div>
        <div style={{ fontSize: 14.2, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{c.mechanism}</div>
      </div>
      {/* risk meter */}
      <div>
        <div style={{ height: 6, background: 'var(--bg-card)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${c.risk}%`, height: '100%', background: tone }} />
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--text-muted)', marginTop: 2, textAlign: 'right' }}>risk {c.risk}</div>
      </div>
      <div style={{ fontSize: 15.8, fontFamily: 'monospace', color: c.capex_musd > 0 ? 'var(--gold)' : 'var(--text-muted)', textAlign: 'right' }}>
        {c.capex_musd > 0 ? `+$${c.capex_musd.toFixed(2)}M` : '–'}
      </div>
      <div style={{ fontSize: 15.8, fontFamily: 'monospace', color: c.lead_weeks > 0 ? 'var(--blue)' : 'var(--text-muted)', textAlign: 'right' }}>
        {c.lead_weeks > 0 ? `+${c.lead_weeks}wk` : '–'}
      </div>
    </div>
  )
}

// ── small presentational helpers (match existing tab styling) ────────────────
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
      {children}
    </div>
  )
}
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 16.5, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>{children}</div>
}
function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  const c = TONE_VAR[tone] ?? 'var(--text-primary)'
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderTop: `2px solid ${c}`, borderRadius: 6, padding: '10px 12px' }}>
      <div style={{ fontSize: 14.2, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, color: c, marginTop: 3 }}>{value}</div>
      <div style={{ fontSize: 14.2, color: 'var(--text-muted)', marginTop: 1 }}>{sub}</div>
    </div>
  )
}
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 5, padding: '7px 10px' }}>
      <div style={{ fontSize: 13.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 19.5, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>{value}</div>
    </div>
  )
}
