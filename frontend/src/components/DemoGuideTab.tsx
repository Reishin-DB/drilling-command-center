interface Props {
  onNavigate: (tabId: string) => void
}

const SCENE = {
  customer: 'An E&P operator drilling across multiple US basins (Permian, East Texas, San Juan, Green River) with subsurface data spread across OSDU, drilling-ops systems, economics spreadsheets, and reservoir studies.',
  today: 'A drilling engineer answering "which wells are subeconomic at today\'s WTI, and why" pulls from three systems and a spreadsheet, then waits on a data team. Governance is manual, and AI assistants either can\'t see the data or ignore who\'s allowed to see what.',
}

const BUSINESS_CASE = [
  { metric: '$40M', label: 'risked NPV10 of the next well, found in existing data' },
  { metric: 'days → minutes', label: 'from question to governed answer' },
  { metric: '3.6x', label: 'lower error filling a missing sonic log' },
  { metric: 'per-persona', label: 'governance applied to data AND AI' },
]

const WHAT_WE_PROVE = [
  'Well logs, tops, headers and economics land governed in Unity Catalog through one Lakeflow pipeline: one plane, no ETL sprawl. The OSDU connector pattern is the same (its partner ADME feed is offline in this demo).',
  'Any engineer queries the portfolio in plain English via Genie, now backed by a governed ontology (metric views + certified functions) so answers are consistent and correct.',
  'The Subsurface Supervisor fans out its specialists and synthesises a recommendation with citations, everyday to technical, in one surface.',
  'An H2S finding flows straight into equipment reality: the same governed NACE MR0175 engine drives the Supervisor gate, the Oilfield Equipment tab, and Genie, so the metallurgy, capex, and lead-time answer is identical everywhere.',
  'Governance covers data AND AI: persona row/column masks apply to Genie answers too, because agents run as the user under Unity Catalog.',
  'The ontology is governed Unity Catalog objects you own (comments, PK/FK graph, metric views, certified functions), not a proprietary graph in a separate platform you copy data into. That is the wedge vs Cognite.',
]

const PLATFORM_PIECES = [
  { name: 'Unity Catalog', role: 'Single governance plane for every OSDU table, metric view, model, and vector index.' },
  { name: 'ADME / OSDU', role: 'Wellbore, reservoir, and rock-and-fluid records from the OSDU data platform (the partner ADME feed is offline in this demo).' },
  { name: 'Lakeflow Pipelines', role: 'Bronze → Silver → Gold with quality and lineage; JSON payloads exploded to flat gold tables.' },
  { name: 'Genie + Metric Views', role: 'Natural-language to governed SQL over an ontology of canonical metrics and certified functions.' },
  { name: 'Foundation Model APIs', role: 'Frontier LLMs power the Subsurface Supervisor synthesis, pay-per-token, no key management.' },
  { name: 'Vector Search', role: 'RAG over analog wells and drilling knowledge with Unity Catalog-governed indexes.' },
  { name: 'Databricks AI Gateway', role: 'Safety + PII guardrails, rate limits, model choice, multi-endpoint failover, and per-run usage/spend tracking (logged to Unity Catalog) in front of every agent.' },
  { name: 'MLflow + Model Serving', role: 'Synthetic-sonic model trained against the Gardner baseline on held-out wells, registered in Unity Catalog, served behind AI Gateway.' },
  { name: 'Voxel geomodel', role: 'Kriged property model from the well logs, computed in the app, honest about its uncertainty.' },
]

interface Step {
  num: number; title: string; tab: string; tabId: string; duration: string
  talkTrack: string; pointAt: string[]; features: string[]
}

const STEPS: Step[] = [
  {
    num: 1, title: 'Locate the wells', tab: 'Locate the Wells', tabId: 'overview', duration: '1 min',
    talkTrack: 'This is the operator\'s fleet on one governed map. Basin footprints (ST_ConvexHull + ST_Buffer + ST_Area) and nearest-offset spacing (ST_Distance) are Databricks Spatial SQL over operator_wells, with the queries shown below. Click Blanco to fly into the field: the amber diamond is the step-out the voxel model proposes, joined to its nearest control well.',
    pointAt: ['Spatial wells map: AOI hulls, spacing lines, Cushing hub', 'Field focus chips fly into each field', 'Amber step-out diamond + inspector card', 'Spatial SQL · GA panel with the live queries'],
    features: ['Spatial SQL (GA)', 'H3', 'Unity Catalog'],
  },
  {
    num: 2, title: 'Read the logs', tab: 'Read the Logs', tabId: 'viewer', duration: '45s',
    talkTrack: 'One well\'s raw curves, QC flags, corrected curves and derived petrophysics (Vcl, porosity, Archie Sw). The same QC runs at scale in the pipeline\'s silver layer, so every number downstream traces back to these samples.',
    pointAt: ['Raw vs corrected tracks', 'QC flags: spikes, gaps, range', 'Derived Vcl / porosity / Sw', 'Formation tops'],
    features: ['Lakeflow pipeline', 'Delta'],
  },
  {
    num: 3, title: 'Fill the missing sonic with a served model', tab: 'Fill the Missing Sonic', tabId: 'sonic', duration: '90s',
    talkTrack: 'Green River 03 was logged without a sonic curve, and geomechanics and seismic ties need one. A model trained on the wells that do have sonic predicts it from the other curves. The evaluation holds out whole wells and compares against the Gardner relation engineers use today, so the model has to beat the trusted method on wells it never saw. It is registered in Unity Catalog and served behind AI Gateway; if the endpoint is cold the app falls back to Gardner and says so.',
    pointAt: ['Model vs Gardner track on the no-sonic well', 'Held-out-well evaluation table', 'Live vs fallback provenance chip', 'Endpoint name'],
    features: ['MLflow', 'Unity Catalog models', 'Model Serving', 'AI Gateway'],
  },
  {
    num: 4, title: 'Model the subsurface in voxels', tab: 'Model the Subsurface', tabId: '3d', duration: '2 min',
    talkTrack: 'This is a geocellular model built from the logs in seconds. Structure honours every well top; porosity, Sw and Vcl are kriged between wells per stratigraphic sub-layer, and reservoir Sw follows a saturation-height function above the free-water level. Switch to Model uncertainty: it is low at the wells and rises away from them, so the model is honest about what it does not know. The section cuts through the proposed step-out, ranked on hydrocarbon pore thickness and haircut for distance from control.',
    pointAt: ['Insight banner: step-out HCPT vs control, risked', 'Attribute toggle: lithology, porosity, Sw, HC pore volume, uncertainty', 'Section, pay-only, depth slice, fault, free-water level', 'Hover any voxel for its properties'],
    features: ['Geostatistics in the app', 'Live from logs', 'Vector Search analogs'],
  },
  {
    num: 5, title: 'Value the step-out', tab: 'Value the Well', tabId: 'economics', duration: '1 min',
    talkTrack: 'The proposed well, priced. The offset\'s type curve is scaled by the ratio of hydrocarbon pore thickness at the step-out to the offset, then both wells are priced from scratch by the certified Unity Catalog functions calculate_npv10 and calculate_break_even at today\'s WTI. Read the unrisked and risked NPV, IRR, payback and break-even; the Live and Illustrative tags say exactly what is assumed. Below it, the portfolio: which wells are underwater today is a live answer, not a month-end report.',
    pointAt: ['Step-out card: offset vs unrisked vs risked', 'Show SQL: the certified function call', 'Live vs Illustrative assumptions', 'Portfolio NPV10 / IRR / break-even'],
    features: ['UC functions', 'Metric views'],
  },
  {
    num: 6, title: 'Decide with the Subsurface Supervisor', tab: 'Decide with AI', tabId: 'supervisor', duration: '2 min',
    talkTrack: 'The Supervisor first plans which specialists the question needs, runs those in parallel, and synthesises one verdict with citations. Use the Choice · Cost · Control bar to swap between frontier and open-weight models through AI Gateway with no code change; each run shows its token cost, the guardrails that ran, and which endpoint served each call.',
    pointAt: ['Orchestration plan: engaged vs skipped specialists', 'Model picker + per-run cost', 'Guardrails + governance panel', 'Economics specialist calling the UC NPV function'],
    features: ['Agent orchestration', 'AI Gateway', 'UC functions'],
  },
  {
    num: 7, title: 'Turn H2S into an equipment decision', tab: 'Equipment & Integrity', tabId: 'equipment', duration: '60s',
    talkTrack: 'The Supervisor flagged H2S. This tab turns each well\'s governed H2S profile into the equipment consequence under NACE MR0175: tubulars, wellhead trim, elastomers, flowlines, with capex and lead time. The same engine drives the Supervisor gate and Genie, so all three give the same answer.',
    pointAt: ['Fleet ranked by sour severity', 'Required spec vs baseline per component', 'Added capex + lead time', 'ESP run-life impact'],
    features: ['NACE MR0175 engine', 'UC functions'],
  },
  {
    num: 8, title: 'Ask in plain English', tab: 'Ask Genie', tabId: 'genie', duration: '60s',
    talkTrack: 'Ask "rank our wells by NPV and show which are economic at 50 dollar WTI", then "which wells are within 50 km of SANJUAN-01". The space is grounded in the governed tables, metric views and certified functions, so it uses live NPV and the distance function instead of improvising. Click Show SQL: every answer is auditable.',
    pointAt: ['Governed SQL shown', 'Certified function used for distance', 'Sample questions + follow-ups'],
    features: ['Genie', 'Unity Catalog'],
  },
  {
    num: 9, title: 'Govern data and AI', tab: 'Governance & Audit', tabId: 'governance', duration: '60s',
    talkTrack: 'Switch persona and ask the same question: masked columns and filtered rows stay that way in the AI answer, because Genie and the Supervisor run as the user under Unity Catalog row filters and column masks.',
    pointAt: ['Persona toggle: row + column masking', 'AI governance panel', 'OBO identity + lineage', 'OSDU legal tags'],
    features: ['Row filters', 'Column masks', 'OBO auth'],
  },
  {
    num: 10, title: 'Show how it is built', tab: 'How It Works', tabId: 'dataflow', duration: '45s',
    talkTrack: 'The whole stack on one view: volume, Lakeflow bronze/silver/gold, MLflow and Model Serving, Genie and the Supervisor on top, Unity Catalog governing all of it. One bundle job rebuilds the data and the model.',
    pointAt: ['Source → medallion → serving', 'Ontology: PK/FK graph, metric views, certified functions', 'Bundle job'],
    features: ['Lakeflow', 'Asset Bundles', 'Unity Catalog'],
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

const CY = '#4fb3e8', AM = '#f5a524', DBR = '#FF3621'

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

      <Panel label="THE DATABRICKS STORY, ONE PLATFORM" col={DBR}>
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

      <Panel label="THE WEDGE, WHY WE BEAT COGNITE" col={DBR} mt>
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

      <Panel label="CLOSING, PICK YOUR LANDING" col={CY} mt>
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
