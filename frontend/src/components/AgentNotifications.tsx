import { useEffect, useState } from 'react'
import { loadBriefing, type Briefing } from './EngineerTab'

// Desktop-style notification stack from the operations agent, shown when the
// engineer signs in for the morning. Clicking a notification opens the briefing.

export default function AgentNotifications({ active, onOpen, onCount }: { active: boolean; onOpen: () => void; onCount: (n: number) => void }) {
  const [b, setB] = useState<Briefing | null>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (!active) { setShown(false); return }
    loadBriefing().then(d => { setB(d); onCount(d.open_total); setShown(true) }).catch(() => {})
  }, [active])

  // Dismiss 20 s after the stack appears, not after the request starts.
  useEffect(() => {
    if (!shown) return
    const t = setTimeout(() => setShown(false), 20000)
    return () => clearTimeout(t)
  }, [shown])

  if (!active || !shown || !b) return null
  const focus = b.items.filter(i => i.well_id === b.focus_well && i.status === 'open')
  const top = focus.filter(i => i.severity === 'critical').slice(0, 2)
  const toasts = [
    { title: `${b.open_focus} action items on ${b.focus_well}`, body: `Extreme-sour well. ${top.length} critical: ${top.map(i => i.title.toLowerCase()).join(' and ')}.`, color: '#ff3621' },
    ...top.map(i => ({ title: i.title, body: i.evidence, color: '#ff3621' })),
    { title: `${b.open_total - b.open_focus} more on ${b.other_wells.length} other wells`, body: 'H2S re-samples, audits and sour capex flagged by the same rules.', color: '#f5a524' },
  ]
  return (
    <div style={{ position: 'fixed', top: 88, right: 18, zIndex: 130, width: 420, display: 'grid', gap: 10 }}>
      {toasts.map((t, k) => (
        <button key={k} onClick={() => { setShown(false); onOpen() }} style={{
          textAlign: 'left', padding: '12px 14px', borderRadius: 14, border: '1px solid #ffffff1f',
          background: 'rgba(22, 34, 44, 0.94)', backdropFilter: 'blur(14px)', boxShadow: '0 10px 30px rgba(0,0,0,.45)',
          color: 'var(--text-primary)', animation: `agent-in .35s ease-out ${k * 0.18}s both`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 4 }}>
            <span style={{ width: 18, height: 18, borderRadius: 5, display: 'grid', placeItems: 'center', background: 'var(--amber-dim)', border: '1px solid #f5a52466', fontSize: 11 }}>⚑</span>
            <b style={{ color: 'var(--text-secondary)' }}>Operations Agent</b> · Subsurface Intelligence <span style={{ marginLeft: 'auto' }}>now</span>
          </div>
          <div style={{ fontSize: 15.5, fontWeight: 650, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: t.color, flex: 'none' }} />{t.title}
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>{t.body}</div>
        </button>
      ))}
      <style>{`@keyframes agent-in { from { opacity: 0; transform: translateX(30px) } to { opacity: 1; transform: none } }`}</style>
    </div>
  )
}
