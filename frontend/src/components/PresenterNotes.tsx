/* Presenter notes: the condensed talk track. Each beat says what to click,
 * what to say, and the line to land. */

type Beat = { tab: string; tabId: string; time: string; say: string; land: string }

const BEATS: Beat[] = [
  { tab: 'Start Here', tabId: 'demo', time: '1 min',
    say: 'Frame one decision: where does the next well go in a field we already produce from, and is it worth drilling? Ask who owns that call today and how many systems it touches.',
    land: 'We go from raw logs to a located, valued, governed well decision on one platform.' },
  { tab: '1. Locate the Wells', tabId: 'overview', time: '1 min',
    say: 'The fleet on the map. Basin footprints and well spacing are Spatial SQL over the governed well table. Click Blanco to fly in: the amber diamond is the step-out the voxel model proposes.',
    land: 'Location is a governed query, not a GIS export.' },
  { tab: '2. Read the Logs', tabId: 'viewer', time: '45 s',
    say: 'Raw curves, QC flags, corrected curves and petrophysics for one well. The pipeline does the same QC at scale in silver.',
    land: 'Every downstream number traces back to these samples.' },
  { tab: '3. Fill the Missing Sonic', tabId: 'sonic', time: '1.5 min',
    say: 'Green River 03 was drilled without a sonic log, and geomechanics needs one. The served model predicts it from the other curves. Show the evaluation: whole wells held out, against the Gardner relation engineers use today.',
    land: 'The model has to beat the method you already trust, on wells it never saw.' },
  { tab: '4. Model the Subsurface', tabId: '3d', time: '2 min',
    say: 'The voxel model is built from the logs: structure honours every well top, properties are kriged between wells. Switch to uncertainty to show where the model does not know. Section through the step-out.',
    land: 'A geomodel in the app, honest about its uncertainty, in seconds.' },
  { tab: '5. Value the Well', tabId: 'economics', time: '45 s',
    say: 'NPV, IRR and break-even per well at today\'s WTI, from certified Unity Catalog functions.',
    land: 'One governed definition of NPV, everywhere it appears.' },
  { tab: '6. Decide with AI', tabId: 'supervisor', time: '2 min',
    say: 'The Supervisor plans which specialists to call, runs them, and returns a verdict with citations. Swap the model live; show the cost and guardrails panel.',
    land: 'Choice, cost and control over the AI, not just the data.' },
  { tab: 'Governance & Audit', tabId: 'governance', time: '1 min',
    say: 'Switch persona: rows and columns disappear for an external partner, and it holds in Genie because agents run as the user.',
    land: 'Unity Catalog governs the data and the AI with one set of policies.' },
  { tab: 'How It Works', tabId: 'dataflow', time: '45 s',
    say: 'Volume, SDP bronze/silver/gold, MLflow training against the baseline, Model Serving, Genie and the app on top. One bundle job rebuilds it.',
    land: 'One pipeline, one registry, one governance layer.' },
]

export default function PresenterNotes({ open, onClose, onNavigate }: {
  open: boolean; onClose: () => void; onNavigate: (id: string) => void
}) {
  if (!open) return null
  return (
    <>
      <button className="cs-overlay" onClick={onClose} aria-label="Close presenter notes" />
      <aside className="cs-drawer" role="dialog" aria-label="Presenter notes">
        <div className="cs-drawer-head">
          <h2>Presenter notes · about 12 minutes</h2>
          <button className="cs-btn" onClick={onClose}>Close</button>
        </div>
        <div className="cs-drawer-body">
          <div className="cs-note">
            <h3>Two people in the room</h3>
            <p>Business: cares about the next well, capex risk and time to decision. Technical: cares about whether the model is trustworthy, the data is governed, and it fits their stack. Check in with each after step 4.</p>
          </div>
          {BEATS.map((b, i) => (
            <div key={b.tab + i} className="cs-note">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <h3 style={{ margin: 0 }}>{b.tab} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {b.time}</span></h3>
                <button className="cs-btn" onClick={() => onNavigate(b.tabId)}>Open</button>
              </div>
              <p>{b.say}</p>
              <p style={{ marginTop: 6, color: 'var(--amber)' }}>{b.land}</p>
            </div>
          ))}
        </div>
      </aside>
    </>
  )
}
