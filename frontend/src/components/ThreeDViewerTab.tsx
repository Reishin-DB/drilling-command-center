import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'

// ─────────── Types (GET /api/voxels/{well_id}) ─────────────────────────────
interface Grid { nx: number; ny: number; nz: number; x0: number; y0: number; z0: number; dx: number; dy: number; dz: number }
interface VWell {
  well_id: string; well_name: string; well_type: string; status: string; x: number; y: number
  path: [number, number, number][]; control: boolean; picks: { name: string; top_ft: number }[]
}
interface Sweet {
  x: number; y: number; lat: number; lon: number; i: number; j: number
  hcpt_ft: number; risked_hcpt_ft: number; control_mean_hcpt_ft: number
  nearest_well_ft: number; uncertainty: number; pay_zones: string[]
}
interface ZoneSummary { name: string; type: string; voxels: number; pay_fraction: number; phi_mean: number | null; sw_mean: number | null; control_wells: number }
interface Model {
  basin: string; field: string; grid: Grid
  zones: { name: string; type: string; top_ft: number; base_ft: number }[]
  zone: number[]; phi: number[]; sw: number[]; vcl: number[]; unc: number[]; hcpt: number[]
  wells: VWell[]
  fault: { azimuth_deg: number; offset_ft: number; throw_ft: number; normal: [number, number] }
  structure: { dip_deg: number; dip_azimuth_deg: number; closure_ft: number }
  fwl_ft: number | null
  pay_cutoffs: { phi: number; sw: number; vcl: number }
  sweet_spot: Sweet
  well_hcpt: { well_id: string; hcpt_ft: number }[]
  zone_summary: ZoneSummary[]
  method: string
  error?: string
}
interface Analog { well_name?: string; primary_reservoir?: string; drilling_result?: string; score: number }

type Attr = 'litho' | 'phi' | 'sw' | 'hcpv' | 'unc'
const ATTRS: { id: Attr; label: string }[] = [
  { id: 'litho', label: 'Lithology' },
  { id: 'phi',   label: 'Porosity' },
  { id: 'sw',    label: 'Water saturation' },
  { id: 'hcpv',  label: 'Hydrocarbon pore volume' },
  { id: 'unc',   label: 'Model uncertainty' },
]

const LITHO: Record<string, string> = {
  shale: '#4d6273', sand: '#c9a86a', carbonate: '#7fb6cf', reservoir: '#f5a524', fluvial: '#a07a4e',
}

// Colour ramps tuned for the deep-water theme.
type Stop = [number, [number, number, number]]
const RAMPS: Record<Exclude<Attr, 'litho'>, Stop[]> = {
  phi:  [[0, [22, 44, 66]], [0.35, [31, 120, 150]], [0.65, [47, 211, 155]], [1, [255, 214, 102]]],
  sw:   [[0, [245, 165, 36]], [0.45, [200, 150, 90]], [0.7, [79, 179, 232]], [1, [30, 70, 140]]],
  hcpv: [[0, [18, 34, 48]], [0.3, [90, 70, 40]], [0.7, [245, 165, 36]], [1, [255, 236, 170]]],
  unc:  [[0, [47, 211, 155]], [0.5, [120, 140, 160]], [1, [183, 155, 255]]],
}
const RANGE: Record<Exclude<Attr, 'litho'>, [number, number]> = { phi: [0, 0.3], sw: [0, 1], hcpv: [0, 0.25], unc: [0, 1] }

function ramp(stops: Stop[], t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t))
  for (let k = 0; k < stops.length - 1; k++) {
    const [pa, ca] = stops[k], [pb, cb] = stops[k + 1]
    if (t <= pb) {
      const u = (t - pa) / (pb - pa)
      return [ca[0] + (cb[0] - ca[0]) * u, ca[1] + (cb[1] - ca[1]) * u, ca[2] + (cb[2] - ca[2]) * u]
    }
  }
  return stops[stops.length - 1][1]
}
const css = (c: [number, number, number]) => `rgb(${c.map(Math.round).join(',')})`

const S = 0.1 // world units per ft

export default function ThreeDViewerTab({ wellId, onWellChange, onNavigate }: {
  wellId: string; onWellChange: (w: string) => void; onNavigate?: (tab: string) => void
}) {
  const [model, setModel] = useState<Model | null>(null)
  const [wells, setWells] = useState<{ well_id: string; well_name: string; basin: string }[]>([])
  const [analogs, setAnalogs] = useState<Analog[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [attr, setAttr] = useState<Attr>('hcpv')
  const [payOnly, setPayOnly] = useState(false)
  const [section, setSection] = useState(true)
  const [topDepth, setTopDepth] = useState(5000)
  const [vex, setVex] = useState(4)
  const [showFault, setShowFault] = useState(true)
  const [hover, setHover] = useState('')

  const mount = useRef<HTMLDivElement>(null)
  const three = useRef<{
    renderer: THREE.WebGLRenderer; labels: CSS2DRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera
    controls: OrbitControls; group: THREE.Group; mesh?: THREE.InstancedMesh; idx?: number[]
  } | null>(null)

  useEffect(() => {
    fetch('/api/wells').then(r => r.json()).then(d => setWells(Array.isArray(d) ? d : d.wells || [])).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true); setErr('')
    fetch(`/api/voxels/${encodeURIComponent(wellId)}`).then(r => {
      if (!r.ok) throw new Error(`Voxel model unavailable (HTTP ${r.status})`)
      return r.json()
    }).then((m: Model) => {
      if (m.error || !m.grid) setErr(m.error || 'Voxel model unavailable')
      else {
        setModel(m)
        // Open on the pay: slice from just above the main reservoir.
        const res = m.zones.find(z => z.type === 'reservoir')
        if (res) setTopDepth(Math.max(5000, Math.round((res.top_ft - 500) / 100) * 100))
      }
      setLoading(false)
    }).catch(e => { setErr(String(e)); setLoading(false) })
    setAnalogs(null)
    fetch(`/api/subsurface/similar/${encodeURIComponent(wellId)}`).then(r => r.json()).then(d => setAnalogs(d.results || [])).catch(() => setAnalogs([]))
  }, [wellId])

  // One-time three.js setup. Plain three (not R3F) and sized from clientWidth so
  // the canvas stays correct under the app's CSS zoom.
  useEffect(() => {
    const el = mount.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(el.clientWidth, el.clientHeight)
    renderer.setClearColor(0x081520)
    el.appendChild(renderer.domElement)
    const labels = new CSS2DRenderer()
    labels.setSize(el.clientWidth, el.clientHeight)
    labels.domElement.style.position = 'absolute'
    labels.domElement.style.inset = '0'
    labels.domElement.style.pointerEvents = 'none'
    el.appendChild(labels.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x081520, 5000, 12000)
    const camera = new THREE.PerspectiveCamera(42, el.clientWidth / el.clientHeight, 5, 40000)
    camera.position.set(2300, 1500, 2600)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, -800, 0)
    controls.enableDamping = true
    controls.maxPolarAngle = Math.PI * 0.62
    scene.add(new THREE.AmbientLight(0xffffff, 0.55))
    scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x1a2a36, 0.55))
    const sun = new THREE.DirectionalLight(0xffffff, 1.0); sun.position.set(1800, 3000, 1200); scene.add(sun)
    const group = new THREE.Group(); scene.add(group)
    three.current = { renderer, labels, scene, camera, controls, group }

    let raf = 0, t0 = performance.now()
    const loop = () => {
      controls.update()
      const pulse = group.getObjectByName('sweet-pulse') as THREE.Mesh | undefined
      if (pulse) { const k = 1 + 0.25 * Math.sin((performance.now() - t0) / 350); pulse.scale.set(k, 1, k) }
      renderer.render(scene, camera); labels.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    loop()
    const ro = new ResizeObserver(() => {
      renderer.setSize(el.clientWidth, el.clientHeight); labels.setSize(el.clientWidth, el.clientHeight)
      camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix()
    })
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.dispose()
      el.removeChild(renderer.domElement); el.removeChild(labels.domElement)
    }
  }, [])

  const g = model?.grid
  const hcpvOf = (i: number) => model!.phi[i] * (1 - model!.sw[i])
  const isPay = (i: number) => {
    const c = model!.pay_cutoffs
    return model!.phi[i] >= c.phi && model!.sw[i] <= c.sw && model!.vcl[i] <= c.vcl
  }

  const visible = useMemo(() => {
    if (!model || !g) return [] as number[]
    const out: number[] = []
    const kTop = Math.max(0, Math.floor((topDepth - g.z0) / g.dz))
    for (let k = kTop; k < g.nz; k++) for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
      const n = i + g.nx * (j + g.ny * k)
      if (model.zone[n] < 0) continue
      if (section && j > model.sweet_spot.j) continue
      if (payOnly && !isPay(n)) continue
      out.push(n)
    }
    return out
  }, [model, section, payOnly, topDepth])

  // Rebuild scene contents when the model or a filter changes.
  useEffect(() => {
    const t = three.current
    if (!t || !model || !g) return
    t.group.traverse(o => {
      const m = o as THREE.Mesh; m.geometry?.dispose()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach(x => x.dispose()); else mat?.dispose?.()
      if (o instanceof CSS2DObject) o.element.remove()
    })
    t.group.clear()

    const X = (x: number) => x * S
    const Zw = (y: number) => -y * S
    const Y = (d: number) => -(d - g.z0) * S * vex

    // Voxels
    const geo = new THREE.BoxGeometry(g.dx * S * 0.96, g.dz * S * vex * 0.92, g.dy * S * 0.96)
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial(), Math.max(1, visible.length))
    const m4 = new THREE.Matrix4(), col = new THREE.Color()
    visible.forEach((n, q) => {
      const i = n % g.nx, j = Math.floor(n / g.nx) % g.ny, k = Math.floor(n / (g.nx * g.ny))
      m4.setPosition(X(g.x0 + (i + 0.5) * g.dx), Y(g.z0 + (k + 0.5) * g.dz), Zw(g.y0 + (j + 0.5) * g.dy))
      mesh.setMatrixAt(q, m4)
      let c: [number, number, number]
      if (attr === 'litho') { col.set(LITHO[model.zones[model.zone[n]].type] || '#5c6470'); mesh.setColorAt(q, col); return }
      const v = attr === 'phi' ? model.phi[n] : attr === 'sw' ? model.sw[n] : attr === 'hcpv' ? hcpvOf(n) : model.unc[n]
      const [lo, hi] = RANGE[attr]
      c = ramp(RAMPS[attr], (v - lo) / (hi - lo))
      col.setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace)
      mesh.setColorAt(q, col)
    })
    mesh.count = visible.length
    t.group.add(mesh); t.mesh = mesh; t.idx = visible

    const half = -g.x0
    // Model frame: top outline and a faint lateral grid at the model top.
    const grid = new THREE.GridHelper(2 * half * S, g.nx / 2, 0x2b4a5e, 0x1a3445)
    grid.position.y = Y(g.z0) + 2
    ;(grid.material as THREE.Material).transparent = true; (grid.material as THREE.Material).opacity = 0.5
    t.group.add(grid)
    const box = new THREE.Box3(new THREE.Vector3(-half * S, Y(g.z0 + g.nz * g.dz), -half * S), new THREE.Vector3(half * S, Y(g.z0), half * S))
    t.group.add(new THREE.Box3Helper(box, new THREE.Color(0x223d4f)))

    // Free-water level
    if (model.fwl_ft) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(2 * half * S, 2 * half * S),
        new THREE.MeshBasicMaterial({ color: 0x4fb3e8, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }))
      p.rotation.x = -Math.PI / 2; p.position.y = Y(model.fwl_ft); t.group.add(p)
      t.group.add(label(`Free-water level · ${model.fwl_ft.toLocaleString()} ft`, new THREE.Vector3(-half * S, Y(model.fwl_ft), half * S), '#4fb3e8'))
    }

    // Fault plane
    if (showFault) {
      const [nx, ny] = model.fault.normal
      const off = model.fault.offset_ft
      const strike = new THREE.Vector3(-ny, 0, -nx) // along-strike direction in world coords (z = -y)
      const center = new THREE.Vector3(X(nx * off), Y(g.z0 + g.nz * g.dz / 2), Zw(ny * off))
      const L = 2 * half * S * 1.2, Hh = g.nz * g.dz * S * vex
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(L, Hh),
        new THREE.MeshBasicMaterial({ color: 0xff3621, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }))
      plane.position.copy(center)
      plane.lookAt(center.clone().add(new THREE.Vector3(X(nx), 0, Zw(ny))))
      t.group.add(plane)
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(L, Hh)), new THREE.LineBasicMaterial({ color: 0xff3621, transparent: true, opacity: 0.5 }))
      edge.position.copy(plane.position); edge.quaternion.copy(plane.quaternion); t.group.add(edge)
      t.group.add(label(`Normal fault · ${model.fault.throw_ft} ft throw`, center.clone().add(strike.multiplyScalar(L * 0.35)).setY(Y(g.z0) + 30), '#ff8a75'))
    }

    // Wells: lit tubes, control wells in sea blue, others muted, labels at the model top.
    for (const w of model.wells) {
      const pts = w.path.filter(p => p[2] >= g.z0 - 700).map(p => new THREE.Vector3(X(p[0]), Y(p[2]), Zw(p[1])))
      if (pts.length < 2) continue
      const active = w.well_id === wellId
      const color = active ? 0xffffff : w.control ? 0x4fb3e8 : 0x6c8494
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, active ? 14 : 10, 10, false),
        new THREE.MeshLambertMaterial({ color, emissive: active ? 0x335566 : 0x0a2030 }))
      t.group.add(tube)
      const head = new THREE.Mesh(new THREE.CylinderGeometry(34, 34, 18, 20), new THREE.MeshLambertMaterial({ color }))
      head.position.copy(pts[0]); t.group.add(head)
      t.group.add(label(`${w.well_id}${w.control ? '' : ' · no logs'}`, pts[0].clone().setY(pts[0].y + 60), active ? '#ffffff' : '#9fd4f2'))
    }

    // Proposed step-out at the sweet spot: amber pulse ring at the top, dashed path to the pay.
    const sp = model.sweet_spot
    const top = new THREE.Vector3(X(sp.x), Y(g.z0 - 700), Zw(sp.y))
    const bottomDepth = model.zones.find(z => z.type === 'reservoir')?.base_ft ?? g.z0 + g.nz * g.dz
    const bot = new THREE.Vector3(X(sp.x), Y(bottomDepth), Zw(sp.y))
    const dashed = new THREE.Line(new THREE.BufferGeometry().setFromPoints([top, bot]), new THREE.LineDashedMaterial({ color: 0xf5a524, dashSize: 40, gapSize: 24 }))
    dashed.computeLineDistances(); t.group.add(dashed)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(70, 9, 10, 40), new THREE.MeshBasicMaterial({ color: 0xf5a524 }))
    ring.rotation.x = Math.PI / 2; ring.position.copy(top); ring.name = 'sweet-pulse'; t.group.add(ring)
    const tgt = new THREE.Mesh(new THREE.SphereGeometry(30, 16, 12), new THREE.MeshBasicMaterial({ color: 0xf5a524 }))
    tgt.position.set(bot.x, Y((model.zones.find(z => z.type === 'reservoir')?.top_ft ?? bottomDepth) + 150), bot.z); t.group.add(tgt)
    t.group.add(label('Proposed step-out', top.clone().setY(top.y + 70), '#f5a524', true))
  }, [visible, attr, vex, showFault, model, wellId])

  // Frame the camera on the model whenever a new model loads.
  useEffect(() => {
    const t = three.current
    if (!t || !model) return
    const half = -model.grid.x0 * S, depth = model.grid.nz * model.grid.dz * S * vex
    const r = Math.max(half, depth) * 1.9
    t.controls.target.set(0, -depth * 0.55, 0)
    t.camera.position.set(r * 0.85, r * 0.55, r * 1.0)
    t.camera.far = r * 10; t.camera.updateProjectionMatrix()
    t.scene.fog = new THREE.Fog(0x081520, r * 1.6, r * 4)
  }, [model])

  // Hover readout via raycast on the instanced voxels.
  const onMove = (e: React.MouseEvent) => {
    const t = three.current
    if (!t?.mesh || !model || !t.idx || !g) return
    const r = t.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, t.camera)
    const hit = ray.intersectObject(t.mesh)[0]
    if (hit?.instanceId == null) { setHover(''); return }
    const n = t.idx[hit.instanceId]
    const k = Math.floor(n / (g.nx * g.ny))
    const z = model.zones[model.zone[n]]
    setHover(`${z.name} (${z.type}) · ${Math.round(g.z0 + (k + 0.5) * g.dz).toLocaleString()} ft · φ ${(model.phi[n] * 100).toFixed(1)}% · Sw ${(model.sw[n] * 100).toFixed(0)}% · Vcl ${(model.vcl[n] * 100).toFixed(0)}% · uncertainty ${model.unc[n].toFixed(2)}${isPay(n) ? ' · PAY' : ''}`)
  }

  const sp = model?.sweet_spot
  const uplift = sp ? (sp.hcpt_ft / Math.max(1, sp.control_mean_hcpt_ft) - 1) * 100 : 0
  const aoiIds = new Set(model?.wells.map(w => w.well_id))

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Insight first: what the model says and what to do about it. */}
      <div className="card" style={{ padding: '16px 20px', display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', borderColor: '#f5a52466', background: 'linear-gradient(90deg, #f5a52414, transparent 60%)' }}>
        <div style={{ flex: '1 1 520px' }}>
          <div className="label" style={{ fontSize: 13.5, marginBottom: 6 }}>Model the subsurface · {model ? `${model.field} field, ${model.basin}` : 'loading'}</div>
          {sp ? (
            <div style={{ fontSize: 19.5, lineHeight: 1.45 }}>
              The voxel model finds a step-out <b style={{ color: 'var(--amber)' }}>{sp.nearest_well_ft.toLocaleString()} ft</b> from the nearest well with
              {' '}<b style={{ color: 'var(--amber)' }}>{sp.hcpt_ft} ft</b> of hydrocarbon pore thickness, {uplift >= 0 ? `${uplift.toFixed(0)}% above` : `${(-uplift).toFixed(0)}% below`} the
              control wells ({sp.control_mean_hcpt_ft} ft). Risked for distance from control: <b>{sp.risked_hcpt_ft} ft</b>, uncertainty {sp.uncertainty.toFixed(2)}.
            </div>
          ) : <div style={{ fontSize: 18, color: 'var(--text-muted)' }}>{err || 'Building the voxel model from the well logs…'}</div>}
        </div>
        {sp && <div style={{ display: 'flex', gap: 10 }}>
          <Metric label="Step-out HCPT" value={`${sp.hcpt_ft} ft`} color="var(--amber)" />
          <Metric label="Risked" value={`${sp.risked_hcpt_ft} ft`} color="var(--text-primary)" />
          <Metric label="Location" value={`${sp.lat.toFixed(3)}, ${sp.lon.toFixed(3)}`} color="var(--blue)" mono />
        </div>}
        {onNavigate && <button className="cs-btn cs-btn-primary" onClick={() => onNavigate('economics')}>Value the well →</button>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 400px', gap: 14 }}>
        <div className="card" style={{ padding: 12 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
            {ATTRS.map(a => (
              <button key={a.id} className="cs-btn" onClick={() => setAttr(a.id)} style={attr === a.id ? { borderColor: 'var(--amber)', color: 'var(--text-primary)', background: 'var(--amber-dim)' } : undefined}>{a.label}</button>
            ))}
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <span className="cs-prov cs-prov-live" title="Every voxel is computed in the app from the wells' logs and tops">Live · from logs</span>
              <span className="cs-prov cs-prov-ill" title="Dip, closure and fault are a modeled framework, honoured at the well tops">Illustrative structure</span>
            </span>
          </div>
          <div style={{ position: 'relative' }}>
            <div ref={mount} onMouseMove={onMove} style={{ width: '100%', height: 720, borderRadius: 8, overflow: 'hidden', position: 'relative', background: '#081520' }} />
            {loading && <div style={{ position: 'absolute', top: 16, left: 16, display: 'flex', gap: 10, alignItems: 'center', fontSize: 16 }}><span className="spinner" /> Kriging well logs into voxels…</div>}
            <div style={{ position: 'absolute', left: 12, bottom: 12, fontSize: 14.5, color: 'var(--text-secondary)', background: '#081520d9', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-dim)', maxWidth: '75%' }}>
              {hover || 'Drag to orbit · scroll to zoom · hover a voxel'}
            </div>
            <div style={{ position: 'absolute', right: 12, top: 12, display: 'flex', gap: 6 }}>
              <span className="badge badge-amber">{visible.length.toLocaleString()} voxels shown</span>
              {g && <span className="badge badge-muted">{(g.nx * g.ny * g.nz).toLocaleString()} cells · {Math.round(g.dx)} × {Math.round(g.dy)} × {Math.round(g.dz)} ft</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 22, alignItems: 'center', marginTop: 12, flexWrap: 'wrap', fontSize: 15.8, color: 'var(--text-secondary)' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>Show below {topDepth.toLocaleString()} ft
              <input type="range" min={5000} max={9400} step={100} value={topDepth} onChange={e => setTopDepth(Number(e.target.value))} /></label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={section} onChange={() => setSection(!section)} /> Section through the step-out</label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={payOnly} onChange={() => setPayOnly(!payOnly)} /> Pay only</label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={showFault} onChange={() => setShowFault(!showFault)} /> Fault</label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>Vertical exaggeration
              <select value={vex} onChange={e => setVex(Number(e.target.value))} style={{ background: 'var(--bg-panel)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 15 }}>
                {[2, 4, 6].map(v => <option key={v} value={v}>{v}x</option>)}</select></label>
          </div>
          <div style={{ marginTop: 10 }}><Legend attr={attr} model={model} /></div>
        </div>

        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <Side title="Anchor well" sub="The model covers every well in the same field within 8 miles">
            <select value={wellId} onChange={e => onWellChange(e.target.value)} style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-panel)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 16.5 }}>
              {(wells.length ? wells : [{ well_id: wellId, well_name: wellId, basin: '' }]).map(w => <option key={w.well_id} value={w.well_id}>{w.well_id}{w.basin ? ` · ${w.basin}` : ''}</option>)}
            </select>
            {model && <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
              {model.wells.map(w => {
                const h = model.well_hcpt.find(x => x.well_id === w.well_id)
                return (
                  <div key={w.well_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15.8, padding: '6px 8px', borderRadius: 6, background: w.well_id === wellId ? 'var(--bg-hover)' : 'transparent' }}>
                    <span className="mono" style={{ color: w.control ? 'var(--blue)' : 'var(--text-muted)' }}>{w.well_id}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{w.well_type} · HCPT {h?.hcpt_ft ?? '–'} ft</span>
                  </div>
                )
              })}
              {[...aoiIds].length === 1 && <div style={{ fontSize: 14.5, color: 'var(--amber)' }}>One control well: away from it the model reverts to the zone averages, and the uncertainty attribute shows it.</div>}
            </div>}
          </Side>

          {model && <Side title="Zones" sub={`Pay cut-offs: φ ≥ ${model.pay_cutoffs.phi * 100}%, Sw ≤ ${model.pay_cutoffs.sw * 100}%, Vcl ≤ ${model.pay_cutoffs.vcl * 100}%`}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
              <thead><tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}><th style={th}>Zone</th><th style={th}>φ</th><th style={th}>Sw</th><th style={th}>Pay</th></tr></thead>
              <tbody>{model.zone_summary.map(z => (
                <tr key={z.name} style={{ borderTop: '1px solid var(--border-dim)' }}>
                  <td style={td}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: LITHO[z.type], marginRight: 8 }} />{z.name}</td>
                  <td style={td}>{z.phi_mean != null ? `${(z.phi_mean * 100).toFixed(1)}%` : '–'}</td>
                  <td style={td}>{z.sw_mean != null ? `${(z.sw_mean * 100).toFixed(0)}%` : '–'}</td>
                  <td style={{ ...td, color: z.pay_fraction > 0.3 ? 'var(--amber)' : 'var(--text-secondary)' }}>{(z.pay_fraction * 100).toFixed(0)}%</td>
                </tr>))}</tbody>
            </table>
          </Side>}

          {model && <Side title="How the model is built" sub="Geostatistics in the app, not a picture">
            <ol style={{ paddingLeft: 20, fontSize: 15, lineHeight: 1.55, color: 'var(--text-secondary)', display: 'grid', gap: 4 }}>
              <li><b style={{ color: 'var(--text-primary)' }}>Structure.</b> Layer-cake from the formation tops: {model.structure.dip_deg}° dip to {model.structure.dip_azimuth_deg}°, {model.structure.closure_ft} ft closure, one normal fault, corrected to honour every well pick.</li>
              <li><b style={{ color: 'var(--text-primary)' }}>Petrophysics.</b> Vcl from GR, density porosity, Archie Sw per depth sample, binned into stratigraphic sub-layers per zone.</li>
              <li><b style={{ color: 'var(--text-primary)' }}>Between wells.</b> Simple kriging per sub-layer, plus a correlated residual scaled by the kriging error. Reservoir Sw follows a saturation-height function above the free-water level.</li>
              <li><b style={{ color: 'var(--text-primary)' }}>Decision.</b> Undrilled columns 2,500 ft to one correlation range from control are ranked on kriged HCPT, haircut by uncertainty.</li>
            </ol>
          </Side>}

          <Side title="Analog wells" sub="Vector Search over the wellbore index">
            {analogs == null ? <span className="spinner" /> : analogs.length === 0
              ? <div style={{ fontSize: 15, color: 'var(--text-muted)' }}>No analogs returned (the OSDU wellbore index is fed by the partner ADME workspace, which is offline).</div>
              : analogs.slice(0, 4).map((a, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, padding: '4px 0', borderTop: i ? '1px solid var(--border-dim)' : 0 }}>
                  <span>{a.well_name || '–'} <span style={{ color: 'var(--text-muted)' }}>{a.primary_reservoir || ''}</span></span>
                  <span className="mono" style={{ color: 'var(--blue)' }}>{a.score.toFixed(2)}</span>
                </div>))}
          </Side>
        </div>
      </div>
    </div>
  )
}

function label(text: string, pos: THREE.Vector3, color: string, strong = false) {
  const el = document.createElement('div')
  el.textContent = text
  el.style.cssText = `font: ${strong ? 700 : 600} 12px 'IBM Plex Sans', sans-serif; color: ${color}; background: #081520cc; border: 1px solid ${color}55; padding: 2px 7px; border-radius: 4px; white-space: nowrap;`
  const o = new CSS2DObject(el); o.position.copy(pos)
  return o
}

const th: React.CSSProperties = { padding: '4px 4px', fontWeight: 600, fontSize: 13.5, textTransform: 'uppercase', letterSpacing: '.05em' }
const td: React.CSSProperties = { padding: '6px 4px' }

function Metric({ label, value, color, mono }: { label: string; value: string; color: string; mono?: boolean }) {
  return (
    <div style={{ padding: '8px 14px', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, minWidth: 120 }}>
      <div className="label" style={{ fontSize: 12 }}>{label}</div>
      <div className={mono ? 'mono' : undefined} style={{ fontSize: mono ? 16.5 : 22.5, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}

function Side({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ fontSize: 17, fontWeight: 700 }}>{title}</div>
      {sub && <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 10 }}>{sub}</div>}
      {children}
    </div>
  )
}

function Legend({ attr, model }: { attr: Attr; model: Model | null }) {
  if (attr === 'litho') {
    const types = model ? [...new Set(model.zones.map(z => z.type))] : Object.keys(LITHO)
    return <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 15 }}>
      {types.map(t => <span key={t} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ width: 14, height: 14, borderRadius: 3, background: LITHO[t] }} />{t}</span>)}
    </div>
  }
  const names: Record<string, [string, string]> = { phi: ['0%', '30%'], sw: ['oil (0%)', 'water (100%)'], hcpv: ['0', 'φ·So 0.25'], unc: ['at a well', 'no control'] }
  const grad = Array.from({ length: 11 }, (_, k) => css(ramp(RAMPS[attr], k / 10))).join(',')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, color: 'var(--text-secondary)' }}>
      <span>{names[attr][0]}</span>
      <span style={{ width: 280, height: 12, borderRadius: 6, background: `linear-gradient(90deg, ${grad})` }} />
      <span>{names[attr][1]}</span>
    </div>
  )
}
