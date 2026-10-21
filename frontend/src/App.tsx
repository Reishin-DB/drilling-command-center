import { useCallback, useEffect, useState } from 'react'
import OverviewTab      from './components/OverviewTab'
import ThreeDViewerTab  from './components/ThreeDViewerTab'
import EconomicsTab     from './components/EconomicsTab'
import EquipmentTab     from './components/EquipmentTab'
import GovernanceTab    from './components/GovernanceTab'
import GenieTab         from './components/GenieTab'
import LogViewerTab     from './components/LogViewerTab'
import SonicTab         from './components/SonicTab'
import DataFlowTab      from './components/DataFlowTab'
import GenieSidebar     from './components/GenieSidebar'
import SupervisorTab    from './components/SupervisorTab'
import DemoGuideTab     from './components/DemoGuideTab'
import PresenterNotes   from './components/PresenterNotes'

type View = { id: string; label: string }

// The left rail mirrors the story: one well decision from map to sanction,
// then the tools that explain the AI, the governance, and the platform.
const WORKFLOW: View[] = [
  { id: 'overview',   label: 'Locate the Wells' },
  { id: 'viewer',     label: 'Read the Logs' },
  { id: 'sonic',      label: 'Fill the Missing Sonic' },
  { id: '3d',         label: 'Model the Subsurface' },
  { id: 'economics',  label: 'Value the Well' },
  { id: 'supervisor', label: 'Decide with AI' },
]
const TOOLS: View[] = [
  { id: 'equipment',  label: 'Equipment & Integrity' },
  { id: 'genie',      label: 'Ask Genie' },
  { id: 'governance', label: 'Governance & Audit' },
  { id: 'dataflow',   label: 'How It Works' },
]

export default function App() {
  const [view, setView]             = useState('demo')
  const [railOpen, setRailOpen]     = useState(false)
  const [notesOpen, setNotesOpen]   = useState(false)
  const [activeWell, setActiveWell] = useState('SANJUAN-01')
  const [genieUrl, setGenieUrl]     = useState('')

  useEffect(() => {
    fetch('/api/genie/space').then(r => r.json()).then(d => setGenieUrl(d.space_url || d.url || '')).catch(() => setGenieUrl(''))
  }, [])

  const go = useCallback((id: string) => { setView(id); setRailOpen(false); window.scrollTo({ top: 0 }) }, [])

  const openWell = (wellId: string, tab: string = '3d') => {
    setActiveWell(wellId)
    go(tab)
  }

  const link = (v: View, marker: React.ReactNode) => (
    <button key={v.id} className="cs-rail-link" aria-current={view === v.id ? 'page' : undefined} onClick={() => go(v.id)}>
      {marker}<span>{v.label}</span>
    </button>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <header className="cs-header">
        <button className="cs-btn cs-menu-toggle" onClick={() => setRailOpen(o => !o)} aria-label="Toggle navigation">☰</button>
        <div className="cs-brand">
          <div className="cs-brand-icon" aria-hidden="true">
            {/* A wellbore through a voxel stack: the brand is the model the app builds. */}
            <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
              <rect x="2"  y="6"  width="7" height="5" rx="1" fill="var(--blue)" opacity=".55" />
              <rect x="17" y="6"  width="7" height="5" rx="1" fill="var(--blue)" opacity=".55" />
              <rect x="2"  y="13" width="7" height="5" rx="1" fill="var(--amber)" opacity=".85" />
              <rect x="17" y="13" width="7" height="5" rx="1" fill="var(--amber)" opacity=".85" />
              <rect x="2"  y="20" width="7" height="4" rx="1" fill="var(--blue)" opacity=".35" />
              <rect x="17" y="20" width="7" height="4" rx="1" fill="var(--blue)" opacity=".35" />
              <path d="M13 1 V22 Q13 25 16 25" stroke="var(--amber)" strokeWidth="2" strokeLinecap="round" fill="none" />
            </svg>
          </div>
          <div>
            <div className="cs-brand-title">Subsurface Intelligence</div>
            <div className="cs-brand-sub">From well logs to a governed drilling decision</div>
          </div>
        </div>
        <div className="cs-toolbar">
          <span className="cs-chip">Active well <b>{activeWell}</b></span>
          <button className="cs-btn" onClick={() => setNotesOpen(true)}>Presenter notes</button>
          {genieUrl && <a className="cs-btn" href={genieUrl} target="_blank" rel="noopener noreferrer">Open Genie space ↗</a>}
          <button className="cs-btn cs-btn-primary" onClick={() => window.dispatchEvent(new CustomEvent('open-genie'))}>Ask the Data</button>
        </div>
      </header>

      <div className="cs-body">
        <aside className="cs-rail" data-open={railOpen}>
          <nav aria-label="Application navigation">
            <div className="cs-rail-group">
              {link({ id: 'demo', label: 'Start Here' }, <span className="cs-step">▶</span>)}
            </div>
            <div className="cs-rail-group">
              <div className="cs-rail-heading">The workflow</div>
              {WORKFLOW.map((v, i) => link(v, <span className="cs-step">{i + 1}</span>))}
            </div>
            <div className="cs-rail-group">
              <div className="cs-rail-heading">Behind the decision</div>
              {TOOLS.map(v => link(v, <span className="cs-step">·</span>))}
            </div>
          </nav>
          <div className="cs-rail-hint">Steps 1 to 6 are the demo. The tools below explain the equipment consequence, the AI, the governance, and the platform underneath.</div>
        </aside>

        <main className="cs-main">
          {view === 'demo'       && <DemoGuideTab    onNavigate={go} />}
          {view === 'overview'   && <OverviewTab     onOpenWell={openWell} />}
          {view === '3d'         && <ThreeDViewerTab wellId={activeWell} onWellChange={setActiveWell} onNavigate={go} />}
          {view === 'viewer'     && <LogViewerTab    wellId={activeWell} onWellChange={setActiveWell} />}
          {view === 'sonic'      && <SonicTab        wellId={activeWell} onWellChange={setActiveWell} onNavigate={go} />}
          {view === 'economics'  && <EconomicsTab    wellId={activeWell} />}
          {view === 'equipment'  && <EquipmentTab    wellId={activeWell} onWellChange={setActiveWell} />}
          {view === 'governance' && <GovernanceTab />}
          {view === 'genie'      && <GenieTab />}
          {view === 'supervisor' && <SupervisorTab />}
          {view === 'dataflow'   && <DataFlowTab />}
        </main>
      </div>

      <PresenterNotes open={notesOpen} onClose={() => setNotesOpen(false)} onNavigate={id => { setNotesOpen(false); go(id) }} />
      <GenieSidebar />
    </div>
  )
}
