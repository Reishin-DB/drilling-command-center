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
  'The Subsurface Supervisor fans out its specialists and synthesises a recommendation with citations — everyday to technical, in one surface.',
  'An H2S finding flows straight into equipment reality: the same governed NACE MR0175 engine drives the Supervisor gate, the Oilfield Equipment tab, and Genie — so the metallurgy, capex, and lead-time answer is identical everywhere.',
  'Governance covers data AND AI: persona row/column masks apply to Genie answers too, because agents run as the user under Unity Catalog.',
  'The ontology is governed Unity Catalog objects you own (comments, PK/FK graph, metric views, certified functions) — not a proprietary graph in a separate platform you copy data into. That is the wedge vs Cognite.',
]

const PLATFORM_PIECES = [
  { name: 'Unity Catalog', role: 'Single governance plane for every OSDU table, metric view, model, and vector index.' },
  { name: 'ADME / OSDU', role: 'Live wellbore, reservoir, and rock-and-fluid records ingested from the OSDU data platform.' },
  { name: 'Lakeflow Pipelines', role: 'Bronze → Silver → Gold with quality and lineage; JSON payloads exploded to flat gold tables.' },
  { name: 'Genie + Metric Views', role: 'Natural-language to governed SQL over an ontology of canonical metrics and certified functions.' },
  { name: 'Foundation Model APIs', role: 'Frontier LLMs power the Subsurface Supervisor synthesis — pay-per-token, no key management.' },
  { name: 'Vector Search', role: 'RAG over analog wells and drilling knowledge with Unity Catalog-governed indexes.' },
  { name: 'Databricks AI Gateway', role: 'Safety + PII guardrails, rate limits, model choice, multi-endpoint failover, and per-run usage/spend tracking (logged to Unity Catalog) in front of every agent.' },
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
    talkTrack: 'Now the payoff. Ask "rank our wells by NPV and show which are economic at 50 dollar WTI." Watch what the ontology enforces without being asked: it uses LIVE NPV (a governed rule, never the original underwriting number), it returns five wells not six because one well\'s data is unverified and the ontology quarantines it automatically, and "economic at 50" correctly means breakeven below 50. A generic chatbot writing SQL from scratch gets one of those wrong and you\'d never know. Click Show SQL — fully auditable, over the governed Unity Catalog tables, because the data never left the platform.',
    pointAt: ['LIVE NPV used automatically (governed rule, not the base number)', '5 trusted wells not 6 — unverified data quarantined by the ontology', 'Governed SQL shown + lineage back to Unity Catalog', 'Sample-question chips + conversational follow-ups'],
    features: ['Genie', 'Unity Catalog', 'Governed NL→SQL'],
  },
  {
    num: 5, title: 'Escalate to the multi-agent Supervisor', tab: 'Subsurface Supervisor', tabId: 'supervisor', duration: '60s',
    talkTrack: 'For a harder question the Subsurface Supervisor is agentic: it first PLANS which of the five specialists the question actually needs and routes to only those — the skipped ones grey out with a reason — then runs the engaged ones in parallel and synthesises one recommendation with citations. Use the CHOICE · COST · CONTROL bar to swap the model (Claude Sonnet/Opus/Haiku or open-weight GPT-OSS/Llama/Qwen) live via the Databricks AI Gateway, no code change. If a provider goes down mid-run the gateway fails over to a backup endpoint automatically. Each run shows its real token COST for the chosen model, plus a GOVERNANCE panel with the AI Gateway guardrails, audit-log line, and Unified Visibility (per-run tokens, spend, and which endpoint served each call, logged to Unity Catalog). That is Control, Cost, Choice, Reliability, and Governance in one run.',
    pointAt: ['Orchestration Plan — engaged vs skipped specialists, with reasons', 'CHOICE · COST · CONTROL picker with $/$$/$$$ tiers', 'Per-run COST (real tokens × model rate) + GOVERNANCE panel', 'Economics specialist calling the certified UC NPV function; Analog specialist via Vector Search'],
    features: ['Omnigent orchestration', 'Choice · Cost · Governance (AI Gateway)', 'Vector Search + UC Functions'],
  },
  {
    num: 6, title: 'Turn H2S into an equipment decision', tab: 'Oilfield Equipment', tabId: 'equipment', duration: '60s',
    talkTrack: 'The Supervisor just flagged H2S. So what does that actually cost us? This tab turns each well\'s governed H2S profile into the equipment consequence, component by component, under NACE MR0175. Pick the sour well: tubulars go from P110 to L80 controlled-hardness against Sulfide Stress Cracking, the wellhead needs sour trim, packer and ESP elastomers move to HNBR/Aflas, flowlines get a corrosion allowance. Each row shows the degradation mechanism, a risk score, the added capex, and the procurement lead time — and the ESP run-life hit if you skip the upgrade. Critically, this is the SAME NACE engine the Supervisor gate and the Genie space use, so the number in the recommendation, the number on this tab, and the answer Genie gives are identical. One governed source of truth, three surfaces.',
    pointAt: ['Fleet ranked by sour severity; KPI strip (sour wells, sour-service capex, longest lead)', 'Per-component required spec vs baseline, with SSC/HIC/corrosion mechanism', 'Added capex + critical-path lead time per component', 'ESP run-life impact if sour metallurgy is skipped'],
    features: ['NACE MR0175 engine', 'well_equipment_integrity', 'f_equipment_spec_for_well'],
  },
  {
    num: 7, title: 'Govern data AND AI', tab: 'Governance', tabId: 'governance', duration: '60s',
    talkTrack: 'Switch persona and ask the same question. Masked columns — lat, lon, API number — stay masked in the AI answer, because Genie and the Supervisor run as the user under Unity Catalog, fronted by the AI Gateway. This is governing AI for all users, not just dashboards.',
    pointAt: ['Persona toggle → live row/column masking', 'AI Governance panel (Gateway, guardrails, model choice)', 'OBO agent identity + UC lineage', 'ADME legal tags + entitlements'],
    features: ['Unity Catalog masks', 'Databricks AI Gateway', 'OBO auth'],
  },
  {
    num: 8, title: 'Show how it\'s built + the context graph', tab: 'Data Flow', tabId: 'dataflow', duration: '45s',
    talkTrack: 'Finally, the whole stack on one view: OSDU → Bronze → Silver → Gold, Genie and the Supervisor on top, Unity Catalog governing everything. Scroll to the Genie Ontology, the governed context graph that made step 4 correct. operator_wells is the hub; four foreign-key edges bind to it — economics, H2S safety, and the well-distance table on BOTH ends (that\'s how the system knows well spacing is a real relationship). Then the metric views (one canonical NPV definition) and certified functions. This is the point vs Cognite: this ontology is governed objects IN the lakehouse you already own, not a proprietary graph in a second platform you have to copy your data into.',
    pointAt: ['Source → medallion → agents flow', 'Relationship graph: 4 FK edges into the operator_wells hub', 'Metric views (canonical NPV) + certified functions', 'Ontology = governed UC objects you own, not a separate platform'],
    features: ['Lakeflow', 'Unity Catalog', 'Ontology'],
  },
]

const CLOSING_PIVOTS = [
  { audience: 'Drilling / Operations', pitch: 'Cut non-productive time and make "which wells are underwater today" a live, self-serve answer instead of a month-end report.' },
  { audience: 'Subsurface / Reservoir', pitch: 'OSDU wellbore, reservoir, and rock-and-fluid data governed in one place, queryable in plain English with correct, consistent metrics.' },
  { audience: 'Data / Platform', pitch: 'One Databricks platform: ADME/OSDU, Lakeflow, Genie, Foundation Models, Vector Search, AI Gateway, all under Unity Catalog. Governance covers data and AI alike.' },
]

// The strategic wedge for a room already being pitched Cognite.
const VS_COGNITE = [
  { dim: 'Where the ontology lives', cognite: 'A separate contextualization platform', dbx: 'Native Unity Catalog objects, where your data already is' },
  { dim: 'Your data', cognite: 'Copied / replicated into their system', dbx: 'One governed copy, no second silo' },
  { dim: 'The knowledge graph', cognite: 'Proprietary, closed to their tooling', dbx: 'Open objects: tables, PK/FK constraints, metric views, SQL functions' },
  { dim: 'Governance', cognite: 'A second control plane to reconcile', dbx: 'One plane over data, BI, and AI' },
  { dim: 'Lock-in', cognite: 'Their platform owns your context', dbx: 'You own the ontology in open formats' },
]
const COGNITE_LINE = 'Cognite\'s model: give us a copy of your data, we build the knowledge graph in our platform. That is a second system to license, a second copy to secure, a second place your context gets locked. Databricks flips it: the ontology IS governed objects in the lakehouse you already run. Your context is an asset you own, feeding one AI, one BI layer, one governance model.'

const CY = '#00E5FF', AM = '#F39C12', DBR = '#FF3621'

export default function DemoGuideTab({ onNavigate }: Props) {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', color: 'var(--text-primary)' }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 6 }}>
          <h1 style={{ color: CY, margin: 0, fontSize: 39, fontWeight: 700 }}>Demo Guide</h1>
          <span style={{ color: 'var(--text-muted)', fontSize: 21 }}>~7 min · 8 steps</span>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 21, lineHeight: 1.55, margin: 0, maxWidth: 820 }}>
          A point-and-click script for running the Drilling Command Center demo end-to-end. Read the talk track, click{' '}
          <strong style={{ color: CY }}>Open {'<tab>'}</strong> to jump to the right view, deliver the moment, then come back here for the next step.
        </p>
      </div>

      <Panel label="THE SCENE" col={CY}>
        <div style={{ color: 'var(--text-secondary)', fontSize: 20.2, lineHeight: 1.65, marginBottom: 10 }}>
          <strong style={{ color: 'var(--text-primary)' }}>Customer.</strong> {SCENE.customer}
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 20.2, lineHeight: 1.65 }}>
          <strong style={{ color: 'var(--text-primary)' }}>Today.</strong> {SCENE.today}
        </div>
      </Panel>

      <Panel label="THE BUSINESS CASE" col={AM}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          {BUSINESS_CASE.map(b => (
            <div key={b.label} style={{ background: 'var(--bg-panel)', border: `1px solid ${DBR}33`, borderRadius: 6, padding: 12 }}>
              <div style={{ color: AM, fontSize: 25.5, fontWeight: 700, marginBottom: 3 }}>{b.metric}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 18, lineHeight: 1.4 }}>{b.label}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel label="WHAT WE'LL PROVE" col={CY}>
        <ol style={{ color: 'var(--text-secondary)', fontSize: 20.2, lineHeight: 1.65, margin: 0, paddingLeft: 20 }}>
          {WHAT_WE_PROVE.map(p => <li key={p} style={{ marginBottom: 6 }}>{p}</li>)}
        </ol>
      </Panel>

      <Panel label="THE DATABRICKS STORY — ONE PLATFORM" col={DBR}>
        <div style={{ color: 'var(--text-muted)', fontSize: 18, marginBottom: 12 }}>
          Every box below is real Databricks product, wired together and governed end-to-end. Name them as they come up.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
          {PLATFORM_PIECES.map(p => (
            <div key={p.name} style={{ background: 'var(--bg-panel)', border: `1px solid ${DBR}44`, borderRadius: 6, padding: 10 }}>
              <div style={{ color: AM, fontSize: 18.8, fontWeight: 700, marginBottom: 3 }}>{p.name}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 17.2, lineHeight: 1.5 }}>{p.role}</div>
            </div>
          ))}
        </div>
      </Panel>

      <div style={{ color: 'var(--text-secondary)', fontSize: 18, fontWeight: 700, letterSpacing: 1, margin: '20px 0 12px', paddingLeft: 4 }}>
        ───── THE WALKTHROUGH ─────
      </div>

      {STEPS.map(step => (
        <div key={step.num} style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
          padding: 20, marginBottom: 12, display: 'grid', gridTemplateColumns: '52px 1fr 170px', gap: 16, alignItems: 'start',
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%', background: `${CY}18`, border: `2px solid ${CY}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 700, color: CY,
          }}>{step.num}</div>

          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
              <h3 style={{ color: 'var(--text-primary)', margin: 0, fontSize: 24, fontWeight: 600 }}>{step.title}</h3>
              <span style={{ color: 'var(--text-muted)', fontSize: 18 }}>~ {step.duration}</span>
            </div>
            <div style={{
              background: 'var(--bg-panel)', borderLeft: `3px solid ${CY}`, padding: '10px 14px', borderRadius: 4,
              marginBottom: 12, color: 'var(--text-secondary)', fontSize: 19.5, lineHeight: 1.55, fontStyle: 'italic',
            }}>"{step.talkTrack}"</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: 15.8, fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 }}>POINT AT</div>
                <ul style={{ color: 'var(--text-secondary)', fontSize: 18, lineHeight: 1.6, margin: 0, paddingLeft: 16 }}>
                  {step.pointAt.map(p => <li key={p}>{p}</li>)}
                </ul>
              </div>
              <div>
                <div style={{ color: AM, fontSize: 15.8, fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 }}>DATABRICKS</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {step.features.map(f => (
                    <span key={f} style={{ background: `${DBR}18`, border: `1px solid ${DBR}44`, color: AM, fontSize: 15.8, fontWeight: 600, padding: '2px 7px', borderRadius: 3 }}>{f}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <button onClick={() => onNavigate(step.tabId)} style={{
            background: CY, color: '#08131a', border: 'none', padding: '10px 14px', borderRadius: 6,
            fontSize: 19.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>Open {step.tab} →</button>
        </div>
      ))}

      <Panel label="THE WEDGE — WHY WE BEAT COGNITE" col={DBR} mt>
        <p style={{ color: 'var(--text-secondary)', fontSize: 18.8, lineHeight: 1.55, margin: '0 0 12px 0' }}>{COGNITE_LINE}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1.3fr', gap: 0, border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', fontSize: 17.2 }}>
          <div style={{ background: 'var(--bg-panel)', padding: '7px 10px', fontWeight: 700, color: 'var(--text-muted)' }}></div>
          <div style={{ background: 'var(--bg-panel)', padding: '7px 10px', fontWeight: 700, color: 'var(--text-muted)' }}>Cognite</div>
          <div style={{ background: `${DBR}18`, padding: '7px 10px', fontWeight: 700, color: AM }}>Databricks</div>
          {VS_COGNITE.map(r => (
            <div key={r.dim} style={{ display: 'contents' }}>
              <div style={{ padding: '7px 10px', borderTop: '1px solid var(--border)', color: 'var(--text-primary)', fontWeight: 600 }}>{r.dim}</div>
              <div style={{ padding: '7px 10px', borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>{r.cognite}</div>
              <div style={{ padding: '7px 10px', borderTop: '1px solid var(--border)', background: `${DBR}0d`, color: 'var(--text-secondary)' }}>{r.dbx}</div>
            </div>
          ))}
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 15.8, marginTop: 8, fontStyle: 'italic' }}>Cognite claims characterized at the architectural level; verify against current Cognite Data Fusion positioning before presenting.</div>
      </Panel>

      <Panel label="CLOSING — PICK YOUR LANDING" col={CY} mt>
        <p style={{ color: 'var(--text-muted)', fontSize: 18.8, margin: '0 0 12px 0' }}>End on the pivot that matches who's in the room:</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
          {CLOSING_PIVOTS.map(p => (
            <div key={p.audience} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 6, padding: 14 }}>
              <div style={{ color: CY, fontSize: 18.8, fontWeight: 700, marginBottom: 6 }}>{p.audience}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 18.8, lineHeight: 1.55 }}>{p.pitch}</div>
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
      <div style={{ color: col, fontSize: 18, fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>{label}</div>
      {children}
    </div>
  )
}
