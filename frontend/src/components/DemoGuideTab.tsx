interface Props {
  onNavigate: (tabId: string) => void
}

const SCENE = {
  customer: 'An E&P operator drilling across multiple US basins (Permian, East Texas, San Juan) with subsurface data spread across OSDU, drilling-ops systems, economics spreadsheets, and reservoir studies.',
  today: 'A drilling engineer answering "which wells are subeconomic at today\'s WTI, and why" pulls from three systems and a spreadsheet, then waits on a data team. Governance is manual, and AI assistants either can\'t see the data or ignore who\'s allowed to see what.',
}

const BUSINESS_CASE = [
  { metric: '$50K+/day', label: 'cost of non-productive drilling time' },
  { metric: 'days → minutes', label: 'from question to governed answer' },
  { metric: 'OSDU-native', label: 'no bespoke ETL from the data platform' },
  { metric: 'per-persona', label: 'governance applied to data AND AI' },
]

const WHAT_WE_PROVE = [
  'Live OSDU wellbore, reservoir, and economics data lands governed in Unity Catalog — one plane, no ETL sprawl.',
  'Any engineer queries the portfolio in plain English via Genie, now backed by a governed ontology (metric views + certified functions) so answers are consistent and correct.',
  'The Subsurface Supervisor fans out five specialists and synthesises a recommendation with citations — everyday to technical, in one surface.',
  'Governance covers data AND AI: persona row/column masks apply to Genie answers too, because agents run as the user under Unity Catalog.',
]

const PLATFORM_PIECES = [
  { name: 'Unity Catalog', role: 'Single governance plane for every OSDU table, metric view, model, and vector index.' },
  { name: 'ADME / OSDU', role: 'Live wellbore, reservoir, and rock-and-fluid records ingested from the OSDU data platform.' },
  { name: 'Lakeflow Pipelines', role: 'Bronze → Silver → Gold with quality and lineage; JSON payloads exploded to flat gold tables.' },
  { name: 'Genie + Metric Views', role: 'Natural-language to governed SQL over an ontology of canonical metrics and certified functions.' },
  { name: 'Foundation Model APIs', role: 'Frontier LLMs power the Subsurface Supervisor synthesis — pay-per-token, no key management.' },
  { name: 'Vector Search', role: 'RAG over analog wells and drilling knowledge with Unity Catalog-governed indexes.' },
  { name: 'Mosaic AI Gateway', role: 'Safety + PII guardrails, rate limits, model choice, and usage tracking in front of every agent.' },
  { name: 'Lakebase / DuckDB', role: 'Low-latency operational state for the drilling journal and alerts.' },
]

interface Step {
  num: number; title: string; tab: string; tabId: string; duration: string
  talkTrack: string; pointAt: string[]; features: string[]
}

const STEPS: Step[] = [
  {
    num: 1, title: 'Set the scene — the portfolio picture', tab: 'Overview', tabId: 'overview', duration: '45s',
    talkTrack: 'This is the operator\'s drilling portfolio — every well, basin, and rig, governed by Unity Catalog. The map opens with the geospatial layers already on: per-basin AOI footprints (ST_ConvexHull + ST_Buffer + ST_Area) and nearest-offset well-spacing lines (ST_Distance), all real Databricks Spatial SQL (GA) over operator_wells, with the queries shown in the panel.',
    pointAt: ['Fleet KPI tiles + world map by basin', 'Spatial SQL · GA panel (H3 + ST_ over operator_wells)', 'Basin AOI join via ST_Contains', 'WTI price context'],
    features: ['ADME / OSDU', 'H3 + ST_ (GA)', 'Unity Catalog'],
  },
  {
    num: 2, title: 'Drop into the subsurface twin', tab: '3D Viewer', tabId: '3d', duration: '45s',
    talkTrack: 'Pick a well and we render the subsurface as a Petrel-style structural model — layered horizons (Sand A, the Sand B reservoir, carbonate), a normal fault offsetting the layers, and structural dip. The real OSDU well trajectories drill straight through it. This is the geological picture an engineer needs before a drilling or completion call.',
    pointAt: ['Petrel-style layered horizons + reservoir band', 'Normal fault with visible throw/offset', 'Real OSDU well trajectories through the model', 'Geology toggle + stratigraphy legend'],
    features: ['Gold OSDU tables', 'Structural model', 'Vector Search analogs'],
  },
  {
    num: 3, title: 'Show the economics live', tab: 'Economics', tabId: 'economics', duration: '45s',
    talkTrack: 'Here\'s per-well economics against live WTI — NPV10, IRR, breakeven. The margin state updates with price, so "which wells are underwater today" is a live answer, not a month-end report.',
    pointAt: ['NPV10 / IRR / breakeven per well', 'Live WTI spot vs breakeven', 'Margin per barrel', 'Portfolio economics'],
    features: ['Metric Views', 'Certified functions'],
  },
  {
    num: 4, title: 'Ask in plain English — ontology-backed Genie', tab: 'Genie', tabId: 'genie', duration: '60s',
    talkTrack: 'Now the payoff. Ask Genie in plain English — "which basin has the highest total live NPV", or "what is the nearest well to BAKER-001". It answers with governed SQL over the Unity Catalog tables (operator_wells, well_economics, well_distances, gov tables), with the SQL shown. One-click sample questions are on the left, and follow-ups work because it remembers the conversation.',
    pointAt: ['Natural-language question → governed SQL + result', 'Economics questions over well_economics', 'Spacing/distance questions over well_distances', 'Sample-question chips + conversational follow-ups'],
    features: ['Genie', 'Unity Catalog', 'Governed NL→SQL'],
  },
  {
    num: 5, title: 'Escalate to the multi-agent Supervisor', tab: 'Subsurface Supervisor', tabId: 'supervisor', duration: '60s',
    talkTrack: 'For a harder question the Subsurface Supervisor is agentic: it first PLANS which of the five specialists the question actually needs and routes to only those — the skipped ones grey out with a reason — then runs the engaged ones in parallel and synthesises one recommendation with citations. Use the CHOICE · COST · CONTROL bar to swap the model (Claude Sonnet/Opus/Haiku or open-weight GPT-OSS/Llama/Qwen) live via Mosaic AI Gateway, no code change. Each run shows its real token COST for the chosen model, and a GOVERNANCE panel with the AI Gateway guardrails + audit-log line. That is Control, Cost, Choice, and Governance in one run.',
    pointAt: ['Orchestration Plan — engaged vs skipped specialists, with reasons', 'CHOICE · COST · CONTROL picker with $/$$/$$$ tiers', 'Per-run COST (real tokens × model rate) + GOVERNANCE panel', 'Economics specialist calling the certified UC NPV function; Analog specialist via Vector Search'],
    features: ['Omnigent orchestration', 'Choice · Cost · Governance (AI Gateway)', 'Vector Search + UC Functions'],
  },
  {
    num: 6, title: 'Govern data AND AI', tab: 'Governance', tabId: 'governance', duration: '60s',
    talkTrack: 'Switch persona and ask the same question. Masked columns — lat, lon, API number — stay masked in the AI answer, because Genie and the Supervisor run as the user under Unity Catalog, fronted by the AI Gateway. This is governing AI for all users, not just dashboards.',
    pointAt: ['Persona toggle → live row/column masking', 'AI Governance panel (Gateway, guardrails, model choice)', 'OBO agent identity + UC lineage', 'ADME legal tags + entitlements'],
    features: ['Unity Catalog masks', 'Mosaic AI Gateway', 'OBO auth'],
  },
  {
    num: 7, title: 'Show how it\'s built + the context graph', tab: 'Data Flow', tabId: 'dataflow', duration: '45s',
    talkTrack: 'Finally, the whole stack on one view: OSDU → Bronze → Silver → Gold, Genie and the Supervisor on top, Unity Catalog governing everything. Scroll to the Genie Ontology — the self-improving context graph of entities, relationships, metric views, and certified functions that made step 4 correct.',
    pointAt: ['Source → medallion → agents flow', 'Unity Catalog governance boundary', 'Genie Ontology context graph', 'Metric views + certified functions'],
    features: ['Lakeflow', 'Unity Catalog', 'Ontology'],
  },
]

const CLOSING_PIVOTS = [
  { audience: 'Drilling / Operations', pitch: 'Cut non-productive time and make "which wells are underwater today" a live, self-serve answer instead of a month-end report.' },
  { audience: 'Subsurface / Reservoir', pitch: 'OSDU wellbore, reservoir, and rock-and-fluid data governed in one place, queryable in plain English with correct, consistent metrics.' },
  { audience: 'Data / Platform', pitch: 'One Databricks platform: ADME/OSDU, Lakeflow, Genie, Foundation Models, Vector Search, AI Gateway, all under Unity Catalog. Governance covers data and AI alike.' },
]

const CY = '#00E5FF', AM = '#F39C12', DBR = '#FF3621'

export default function DemoGuideTab({ onNavigate }: Props) {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', color: 'var(--text-primary)' }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 6 }}>
          <h1 style={{ color: CY, margin: 0, fontSize: 26, fontWeight: 700 }}>Demo Guide</h1>
          <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>~6 min · 7 steps</span>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.55, margin: 0, maxWidth: 820 }}>
          A point-and-click script for running the Drilling Command Center demo end-to-end. Read the talk track, click{' '}
          <strong style={{ color: CY }}>Open {'<tab>'}</strong> to jump to the right view, deliver the moment, then come back here for the next step.
        </p>
      </div>

      <Panel label="THE SCENE" col={CY}>
        <div style={{ color: 'var(--text-secondary)', fontSize: 13.5, lineHeight: 1.65, marginBottom: 10 }}>
          <strong style={{ color: 'var(--text-primary)' }}>Customer.</strong> {SCENE.customer}
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 13.5, lineHeight: 1.65 }}>
          <strong style={{ color: 'var(--text-primary)' }}>Today.</strong> {SCENE.today}
        </div>
      </Panel>

      <Panel label="THE BUSINESS CASE" col={AM}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          {BUSINESS_CASE.map(b => (
            <div key={b.label} style={{ background: 'var(--bg-panel)', border: `1px solid ${DBR}33`, borderRadius: 6, padding: 12 }}>
              <div style={{ color: AM, fontSize: 17, fontWeight: 700, marginBottom: 3 }}>{b.metric}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.4 }}>{b.label}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel label="WHAT WE'LL PROVE" col={CY}>
        <ol style={{ color: 'var(--text-secondary)', fontSize: 13.5, lineHeight: 1.65, margin: 0, paddingLeft: 20 }}>
          {WHAT_WE_PROVE.map(p => <li key={p} style={{ marginBottom: 6 }}>{p}</li>)}
        </ol>
      </Panel>

      <Panel label="THE DATABRICKS STORY — ONE PLATFORM" col={DBR}>
        <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 12 }}>
          Every box below is real Databricks product, wired together and governed end-to-end. Name them as they come up.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
          {PLATFORM_PIECES.map(p => (
            <div key={p.name} style={{ background: 'var(--bg-panel)', border: `1px solid ${DBR}44`, borderRadius: 6, padding: 10 }}>
              <div style={{ color: AM, fontSize: 12.5, fontWeight: 700, marginBottom: 3 }}>{p.name}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 11.5, lineHeight: 1.5 }}>{p.role}</div>
            </div>
          ))}
        </div>
      </Panel>

      <div style={{ color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, letterSpacing: 1, margin: '20px 0 12px', paddingLeft: 4 }}>
        ───── THE WALKTHROUGH ─────
      </div>

      {STEPS.map(step => (
        <div key={step.num} style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
          padding: 20, marginBottom: 12, display: 'grid', gridTemplateColumns: '52px 1fr 170px', gap: 16, alignItems: 'start',
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%', background: `${CY}18`, border: `2px solid ${CY}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: CY,
          }}>{step.num}</div>

          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
              <h3 style={{ color: 'var(--text-primary)', margin: 0, fontSize: 16, fontWeight: 600 }}>{step.title}</h3>
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>~ {step.duration}</span>
            </div>
            <div style={{
              background: 'var(--bg-panel)', borderLeft: `3px solid ${CY}`, padding: '10px 14px', borderRadius: 4,
              marginBottom: 12, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.55, fontStyle: 'italic',
            }}>"{step.talkTrack}"</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: 10.5, fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 }}>POINT AT</div>
                <ul style={{ color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.6, margin: 0, paddingLeft: 16 }}>
                  {step.pointAt.map(p => <li key={p}>{p}</li>)}
                </ul>
              </div>
              <div>
                <div style={{ color: AM, fontSize: 10.5, fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 }}>DATABRICKS</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {step.features.map(f => (
                    <span key={f} style={{ background: `${DBR}18`, border: `1px solid ${DBR}44`, color: AM, fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 3 }}>{f}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <button onClick={() => onNavigate(step.tabId)} style={{
            background: CY, color: '#08131a', border: 'none', padding: '10px 14px', borderRadius: 6,
            fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>Open {step.tab} →</button>
        </div>
      ))}

      <Panel label="CLOSING — PICK YOUR LANDING" col={CY} mt>
        <p style={{ color: 'var(--text-muted)', fontSize: 12.5, margin: '0 0 12px 0' }}>End on the pivot that matches who's in the room:</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
          {CLOSING_PIVOTS.map(p => (
            <div key={p.audience} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 6, padding: 14 }}>
              <div style={{ color: CY, fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>{p.audience}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12.5, lineHeight: 1.55 }}>{p.pitch}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function Panel({ label, col, children, mt }: { label: string; col: string; children: React.ReactNode; mt?: boolean }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 18, marginBottom: 12, marginTop: mt ? 20 : 0 }}>
      <div style={{ color: col, fontSize: 12, fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>{label}</div>
      {children}
    </div>
  )
}
