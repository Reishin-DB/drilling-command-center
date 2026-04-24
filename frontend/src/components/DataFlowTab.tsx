import { useState } from 'react'

interface NodeDef {
  id: string
  label: string
  sub: string
  x: number; y: number; w: number; h: number
  color: string
  badge?: string
  detail: string[]
}

interface EdgeDef { from: string; to: string; label: string; color?: string; dashed?: boolean }

// ─── Row 1: Sources ────────────────────────────────────────────────────────
const SOURCES: NodeDef[] = [
  {
    id: 'adme', label: 'ADME / OSDU', sub: 'opendes partition',
    x: 60, y: 60, w: 150, h: 62,
    color: '#27AE60', badge: 'SOURCE',
    detail: [
      'Live cloud OSDU instance (sandbox)',
      'Managed Identity authentication',
      'Wellbore, reservoir, rock_and_fluid',
      'Entitlement groups + legal tags',
    ],
  },
  {
    id: 'fred', label: 'FRED WTI', sub: 'public market',
    x: 60, y: 160, w: 150, h: 62,
    color: '#27AE60', badge: 'SOURCE',
    detail: [
      'Daily WTI crude spot (DCOILWTICO)',
      'Pulled at app startup',
      'Synthetic fallback if egress blocked',
      '784-day rolling window',
    ],
  },
]

// ─── Row 2: Medallion (Delta + UC) ─────────────────────────────────────────
const MEDALLION: NodeDef[] = [
  {
    id: 'bronze', label: 'Bronze', sub: 'raw ingest',
    x: 300, y: 60, w: 130, h: 62,
    color: '#CD6116', badge: 'BRONZE',
    detail: [
      'bronze_wellbore · bronze_reservoir · bronze_rock_and_fluid',
      'Auto Loader (cloudFiles)',
      'Schema inference + evolution',
      'Raw OSDU record preservation',
    ],
  },
  {
    id: 'silver', label: 'Silver', sub: 'cleaned',
    x: 480, y: 60, w: 130, h: 62,
    color: '#8E9AAF', badge: 'SILVER',
    detail: [
      'silver_wellbore · silver_reservoir · silver_rock_and_fluid',
      'Type casting + dedup',
      'Extension properties normalized',
      'Silver payload as structured JSON',
    ],
  },
  {
    id: 'gold', label: 'Gold · Search', sub: 'wellbore_search_source',
    x: 660, y: 60, w: 150, h: 62,
    color: '#F39C12', badge: 'GOLD',
    detail: [
      'Delta table with CDF',
      'Pre-joined text column for embedding',
      'Row filter (external_partner_filter)',
      'Column masks on lat/lon',
    ],
  },
  {
    id: 'gov_checkpoints', label: 'gov_* tables', sub: 'legal + entitlements',
    x: 480, y: 160, w: 130, h: 62,
    color: '#8E9AAF', badge: 'SILVER',
    detail: [
      'gov_legal_tags · gov_entitlements · gov_record_acl_mirror',
      'Sync from OSDU entitlement service',
      'Drives the Governance tab',
    ],
  },
]

// ─── Row 3: Serving / AI ───────────────────────────────────────────────────
const SERVING: NodeDef[] = [
  {
    id: 'vs', label: 'Vector Search', sub: 'subsurface-vs',
    x: 300, y: 280, w: 160, h: 62,
    color: '#4dabf7', badge: 'VS',
    detail: [
      'Δ-sync index on wellbore_search_source',
      'databricks-gte-large-en embeddings',
      'Semantic well similarity',
      'Powers "similar wells" in 3D viewer + Agent',
    ],
  },
  {
    id: 'uc_fn', label: 'UC Functions', sub: 'Python in catalog',
    x: 480, y: 280, w: 160, h: 62,
    color: '#b37feb', badge: 'UC FN',
    detail: [
      'calculate_npv10(capex, opex, rate, decline, wti, years)',
      'calculate_break_even(capex, opex, rate, decline)',
      'forecast_decline_curve(peak, decline, b, years)',
      'EXECUTE grants to app SP',
    ],
  },
  {
    id: 'genie', label: 'Genie Space', sub: 'Drilling Command Center',
    x: 660, y: 280, w: 160, h: 62,
    color: '#00E5FF', badge: 'GENIE',
    detail: [
      'space_id 01f13f7f8e20...',
      'Natural language → SQL over 5 OSDU tables',
      'Conversation API (start + message + poll)',
      'Floating sidebar launcher in every tab',
    ],
  },
  {
    id: 'fmapi', label: 'Claude Sonnet 4.5', sub: 'Foundation Model API',
    x: 840, y: 280, w: 160, h: 62,
    color: '#9254de', badge: 'LLM',
    detail: [
      'databricks-claude-sonnet-4-5 serving endpoint',
      'Tool-calling (OpenAI-compatible schema)',
      'Agent orchestrates VS + UC Fn + context',
      'Trace surfaced inline per call',
    ],
  },
]

// ─── Row 4: App ────────────────────────────────────────────────────────────
const APPL: NodeDef[] = [
  {
    id: 'duckdb', label: 'DuckDB (in-app)', sub: 'OLAP embedded',
    x: 300, y: 420, w: 160, h: 62,
    color: '#2980B9', badge: 'CACHE',
    detail: [
      'Seed on startup (OSDU → DuckDB)',
      'Postgres-dialect shim over asyncpg API',
      'Routes query locally — no warehouse round-trip',
      'No persistence across app restart',
    ],
  },
  {
    id: 'fastapi', label: 'FastAPI', sub: 'Python · uvicorn',
    x: 480, y: 420, w: 160, h: 62,
    color: '#16A085', badge: 'API',
    detail: [
      '/api/subsurface/scene · similar · /wells · /logs',
      '/api/economics · /governance · /genie · /agent',
      'OBO via X-Forwarded-Access-Token',
      'Deployed as Databricks App on Azure',
    ],
  },
  {
    id: 'agent', label: 'Expert Agent', sub: 'tool-calling loop',
    x: 660, y: 420, w: 160, h: 62,
    color: '#ffa940', badge: 'AGENT',
    detail: [
      'Claude + 5 tools',
      'Per-call latency trace returned to UI',
      'Fallback gracefully on tool errors',
      'Context injected from active_well_id',
    ],
  },
  {
    id: 'react', label: 'React UI', sub: 'Vite + TypeScript',
    x: 840, y: 420, w: 160, h: 62,
    color: '#73d13d', badge: 'UI',
    detail: [
      'Dark theme, inherited + evolved from las-viewer',
      '7 tabs + floating Genie + 3D SVG subsurface',
      'Recharts for economics/timeseries',
      'Built to static assets, served by FastAPI',
    ],
  },
]

// ─── User ──────────────────────────────────────────────────────────────────
const USER: NodeDef = {
  id: 'user', label: 'You', sub: 'SA / petrotech user',
  x: 1040, y: 60, w: 120, h: 62,
  color: '#2C3E50', badge: 'USER',
  detail: [
    'OBO identity forwarded to app',
    'Persona toggle drives UC row/column masks',
    'Launches Expert Agent + Genie queries',
    'Clicks drill down into 3D / Log Viewer',
  ],
}

// ─── Edges ─────────────────────────────────────────────────────────────────
const EDGES: EdgeDef[] = [
  // Sources → Bronze
  { from: 'adme',    to: 'bronze',  label: 'connector',  color: '#27AE60' },
  { from: 'fred',    to: 'duckdb',  label: 'httpx / fallback',  color: '#27AE60', dashed: true },
  // Medallion
  { from: 'bronze',  to: 'silver',  label: 'DLT clean',  color: '#CD6116' },
  { from: 'silver',  to: 'gold',    label: 'text union', color: '#8E9AAF' },
  // Silver → gov
  { from: 'silver',  to: 'gov_checkpoints', label: 'gov split', color: '#8E9AAF', dashed: true },
  // Gold → Vector Search
  { from: 'gold',    to: 'vs',      label: 'Δ-sync · gte-large', color: '#F39C12' },
  // Vector Search / UC Fn / Genie → Agent
  { from: 'vs',      to: 'agent',   label: 'similarity',         color: '#4dabf7', dashed: true },
  { from: 'uc_fn',   to: 'agent',   label: 'EXECUTE',            color: '#b37feb', dashed: true },
  { from: 'genie',   to: 'fastapi', label: 'Conversation API',   color: '#00E5FF', dashed: true },
  // FMAPI ↔ Agent
  { from: 'fmapi',   to: 'agent',   label: 'tool-calls',         color: '#9254de' },
  // DB → FastAPI
  { from: 'duckdb',  to: 'fastapi', label: 'async queries',      color: '#2980B9' },
  // Agent → FastAPI → React
  { from: 'agent',   to: 'react',   label: 'answer + trace',     color: '#ffa940', dashed: true },
  { from: 'fastapi', to: 'react',   label: 'JSON REST',          color: '#16A085' },
  // React → User
  { from: 'react',   to: 'user',    label: 'browser',            color: '#73d13d' },
]

const ALL_NODES: NodeDef[] = [...SOURCES, ...MEDALLION, ...SERVING, ...APPL, USER]
const nodeById = (id: string) => ALL_NODES.find(n => n.id === id)

function arrowPath(e: EdgeDef): string {
  const a = nodeById(e.from); const b = nodeById(e.to)
  if (!a || !b) return ''
  const ax = a.x + a.w / 2, ay = a.y + a.h / 2
  const bx = b.x + b.w / 2, by = b.y + b.h / 2

  // Horizontal same-row edge
  if (Math.abs(ay - by) < 10) {
    return `M${a.x + a.w},${ay} L${b.x},${by}`
  }
  // Vertical arrow (same column)
  if (Math.abs(ax - bx) < 10) {
    return `M${ax},${a.y + a.h} L${bx},${b.y}`
  }
  // Corner route: horizontal then vertical
  const midX = (a.x + a.w + b.x) / 2
  return `M${a.x + a.w},${ay} L${midX},${ay} L${midX},${by} L${b.x},${by}`
}

// ─── Component ─────────────────────────────────────────────────────────────
export default function DataFlowTab() {
  const [selected, setSelected] = useState<string | null>(null)
  const sel = selected ? nodeById(selected) : null

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 8, padding: 14,
      }}>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Subsurface Intelligence · Data & AI Flow</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Click any node to see what it does · orange dashed box = Unity Catalog governance boundary
          </div>
        </div>

        <svg viewBox="0 0 1200 520" style={{ width: '100%', background: 'var(--bg-primary)', borderRadius: 6 }}>
          {/* Layer labels */}
          <text x="12" y="32"  fill="var(--text-muted)" fontSize="10" fontFamily="monospace">SOURCES</text>
          <text x="12" y="130" fill="var(--text-muted)" fontSize="10" fontFamily="monospace">(external)</text>
          <text x="230" y="32" fill="var(--text-muted)" fontSize="10" fontFamily="monospace">MEDALLION · Delta · Unity Catalog</text>
          <text x="230" y="252" fill="var(--text-muted)" fontSize="10" fontFamily="monospace">SERVING · AI</text>
          <text x="230" y="392" fill="var(--text-muted)" fontSize="10" fontFamily="monospace">APPLICATION</text>

          {/* Unity Catalog governance boundary */}
          <rect x="270" y="40" width="570" height="320" fill="none" stroke="#F39C12" strokeWidth="1"
                strokeDasharray="6 4" rx="10" opacity="0.8" />
          <text x="560" y="37" textAnchor="middle" fill="#F39C12" fontSize="11" fontWeight="600" fontFamily="monospace">
            Unity Catalog · governance · tags · row filters · masks
          </text>

          <defs>
            <marker id="dfArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L10,5 L0,10 Z" fill="#6b7280" />
            </marker>
          </defs>

          {/* Edges */}
          {EDGES.map((e, i) => {
            const d = arrowPath(e)
            const col = e.color || '#6b7280'
            return (
              <g key={`edge-${i}`}>
                <path d={d} fill="none" stroke={col} strokeWidth="1.2"
                      strokeDasharray={e.dashed ? '5 4' : 'none'}
                      markerEnd="url(#dfArrow)" opacity="0.85" />
                <text fontSize="9" fill={col} fontFamily="monospace">
                  <textPath href={`#label-path-${i}`} startOffset="40%" textAnchor="middle">{e.label}</textPath>
                </text>
                <path id={`label-path-${i}`} d={d} fill="none" stroke="none" />
              </g>
            )
          })}

          {/* Nodes */}
          {ALL_NODES.map(n => (
            <g key={n.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(n.id)}>
              <rect x={n.x} y={n.y} width={n.w} height={n.h} rx="6"
                    fill="var(--bg-card)" stroke={selected === n.id ? '#00E5FF' : n.color}
                    strokeWidth={selected === n.id ? 2 : 1.2} />
              {n.badge && (
                <>
                  <rect x={n.x + 8} y={n.y + 6} width="48" height="15" rx="3" fill={n.color} opacity="0.25" />
                  <text x={n.x + 32} y={n.y + 17} textAnchor="middle" fill={n.color} fontSize="9"
                        fontFamily="monospace" fontWeight="700">{n.badge}</text>
                </>
              )}
              <text x={n.x + n.w / 2} y={n.y + 40} textAnchor="middle" fill="var(--text-primary)"
                    fontSize="13" fontWeight="600">{n.label}</text>
              <text x={n.x + n.w / 2} y={n.y + 54} textAnchor="middle" fill="var(--text-muted)"
                    fontSize="10" fontFamily="monospace">{n.sub}</text>
            </g>
          ))}
        </svg>
      </div>

      {/* Detail panel */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 8, padding: 16,
      }}>
        {sel ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{
                padding: '2px 8px', borderRadius: 3, background: sel.color, opacity: 0.85,
                fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: '#0d0e11',
              }}>{sel.badge}</span>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{sel.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {sel.sub}</div>
              <button onClick={() => setSelected(null)} style={{
                marginLeft: 'auto', background: 'transparent', color: 'var(--text-muted)',
                border: '1px solid var(--border)', borderRadius: 4, padding: '2px 10px',
                fontSize: 11, cursor: 'pointer',
              }}>Back to overview</button>
            </div>
            <ul style={{ fontSize: 12, color: 'var(--text-secondary)', paddingLeft: 20, lineHeight: 1.7 }}>
              {sel.detail.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          </>
        ) : (
          <>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 10 }}>
              How it works
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { h: '1 · Ingest',     c: 'OSDU → Bronze via connector. FRED crude via HTTP. Everything lands in Delta, governed by Unity Catalog.', col: '#27AE60' },
                { h: '2 · Transform',  c: 'DLT cleans Bronze → Silver. Silver joins into a Gold search table with CDF for Vector Search syncing.', col: '#CD6116' },
                { h: '3 · Serve',      c: 'Vector Search indexes the Gold text; UC Functions expose NPV, break-even, decline forecasts; Genie owns NL→SQL.', col: '#4dabf7' },
                { h: '4 · Reason',     c: 'The Expert Agent (Claude Sonnet 4.5) orchestrates tools — VS + UC Fn + context — and returns an answer with trace.', col: '#9254de' },
                { h: 'Governance',     c: 'UC row filters + column masks apply on lat/lon and drilling_result depending on persona group membership.', col: '#F39C12' },
                { h: 'OBO auth',       c: 'Databricks Apps forwards X-Forwarded-Access-Token. SQL queries, Vector Search, and Genie run as the user, not the app SP.', col: '#2980B9' },
                { h: 'Cache',          c: 'DuckDB in-process caches seeded OSDU + synthetic economics for sub-ms reads. No Lakebase dependency.', col: '#16A085' },
                { h: 'UI',             c: 'React 18 + Recharts + SVG 3D. Dark theme. Built once, served static from FastAPI. Floating Genie on every tab.', col: '#73d13d' },
              ].map(c => (
                <div key={c.h} style={{
                  background: 'var(--bg-panel)', border: '1px solid var(--border)',
                  borderLeft: `3px solid ${c.col}`, borderRadius: 4,
                  padding: '10px 12px',
                }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: c.col, marginBottom: 4 }}>{c.h}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{c.c}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
