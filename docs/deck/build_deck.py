"""
Build the Subsurface Intelligence deck (HTML -> PDF via headless Chrome).

Numbers come from ml/metrics.json (the training job) and docs/deck/stepouts.json
(GET /api/voxels/stepouts on the deployed app) and docs/deck/stepout_value.json
(GET /api/voxels/stepout_value/SANJUAN-01), so the deck matches the latest
run:  python docs/deck/build_deck.py
"""
import json
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
M = json.loads((ROOT / "ml" / "metrics.json").read_text())
STEPS = json.loads((HERE / "stepouts.json").read_text())["stepouts"]
SO = next(s for s in STEPS if s["field"] == "Blanco")
V = json.loads((HERE / "stepout_value.json").read_text())
VC = V["cases"]
DELAY = 1 - 1 / 1.10 ** 0.5          # share of NPV lost to a 6-month delay at 10%
DELAY_R = VC["risked"]["npv10_musd"] * DELAY
DELAY_U = VC["stepout"]["npv10_musd"] * DELAY

P = M["pooled"]
CH = M["champion_scores"]
GC = P["gardner_calibrated"]
GT = P["gardner_textbook"]
FA = P["faust_calibrated"]
GB = P["model"]
X_BETTER = GC["mae"] / CH["mae"]
UPLIFT = (SO["hcpt_ft"] / SO["control_mean_hcpt_ft"] - 1) * 100

CSS = """
@page { size: 13.333in 7.5in; margin: 0 }
* { box-sizing: border-box }
body { margin: 0; font-family: 'IBM Plex Sans', Inter, 'Helvetica Neue', Arial, sans-serif; color: #12232E; }
.s { width: 13.333in; height: 7.5in; padding: 0.55in 0.7in 0.5in; position: relative; page-break-after: always; overflow: hidden; background: #fff }
.k { font-family: 'IBM Plex Mono', ui-monospace, Menlo, monospace; font-size: 11px; letter-spacing: .22em; text-transform: uppercase; color: #D9881A; font-weight: 700 }
h1 { font-size: 44px; line-height: 1.08; margin: 10px 0 10px; letter-spacing: -.01em }
h2 { font-size: 32px; line-height: 1.16; margin: 8px 0 16px; letter-spacing: -.005em }
p, li { font-size: 17px; line-height: 1.5; color: #3A4C58 }
.lead { font-size: 18px; color: #3A4C58; max-width: 10.8in }
.callout { border-left: 4px solid #D9881A; background: #F3F6F8; padding: 16px 22px; border-radius: 4px; font-size: 19px; font-weight: 600; color: #12232E }
.a { color: #D9881A } .b { color: #2B86C5 } .g { color: #0F9B6E }
.grid { display: grid; gap: 14px }
.c2 { grid-template-columns: 1fr 1fr } .c3 { grid-template-columns: repeat(3, 1fr) } .c4 { grid-template-columns: repeat(4, 1fr) } .c6 { grid-template-columns: repeat(6, 1fr) }
.card { border: 1px solid #D3DCE2; border-radius: 8px; padding: 16px 18px; background: #fff }
.card h3 { margin: 4px 0 8px; font-size: 18px }
.card p { margin: 0; font-size: 15px; line-height: 1.5 }
.tile { border-top: 3px solid #D9881A; padding-top: 10px }
.tile .v { font-size: 36px; font-weight: 700; color: #12232E; letter-spacing: -.01em }
.tile .l { font-size: 14.5px; color: #566874; line-height: 1.4 }
.src { font-family: 'IBM Plex Mono', ui-monospace, Menlo, monospace; font-size: 9.5px; color: #8494A0; letter-spacing: .04em }
.foot { position: absolute; bottom: 0.28in; left: 0.7in; right: 0.7in; border-top: 1px solid #D3DCE2; padding-top: 6px; display: flex; justify-content: space-between }
.chip { display: inline-block; font-family: 'IBM Plex Mono', ui-monospace, Menlo, monospace; font-size: 12px; font-weight: 700; border: 1.5px solid #9AAAB5; border-radius: 5px; padding: 6px 10px; background: #F3F6F8 }
.arrow { color: #9AAAB5; margin: 0 6px; font-weight: 700 }
table { border-collapse: collapse; width: 100% }
th, td { text-align: left; font-size: 15px; padding: 9px 12px; border-bottom: 1px solid #E2E8EC }
th { font-family: 'IBM Plex Mono', ui-monospace, Menlo, monospace; font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; color: #566874 }
tr.win td { color: #0F9B6E; font-weight: 700 }
.box { border: 1.5px solid #9AAAB5; border-radius: 7px; padding: 11px 8px; font-size: 14px; background: #fff; text-align: center; font-weight: 600 }
.box small { display: block; font-weight: 400; color: #566874; font-size: 11.5px; margin-top: 2px }
.uc { border: 2px dashed #D9881A; border-radius: 12px; padding: 22px 16px 14px; position: relative }
.uc .lbl { position: absolute; top: -10px; left: 16px; background: #fff; padding: 0 8px; color: #D9881A; font-weight: 700; font-size: 12px; font-family: 'IBM Plex Mono', monospace; letter-spacing: .1em }
.row { display: flex; align-items: center; gap: 8px }
.lane { font-family: 'IBM Plex Mono', monospace; font-size: 10px; letter-spacing: .14em; color: #8494A0; width: 92px; flex: none }
.badge { font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; font-weight: 700; padding: 1px 6px; border-radius: 99px; margin-left: 6px }
.live { color: #0B7A55; border: 1px solid #0B7A55 } .ill { color: #B26A00; border: 1px solid #B26A00 }
.shot { width: 100%; border: 1px solid #D3DCE2; border-radius: 8px; object-fit: cover; object-position: top }
"""


def foot(_n=None):
    return '<div class="foot"><span class="src">Subsurface Intelligence · FE Bar build · synthetic well data</span><span class="src">@@PAGE@@</span></div>'


def slides():
    shots = (ROOT / "screenshots").as_uri()
    out = []

    out.append(f"""<div class="s" style="background:#0A1620;color:#EEF3F6">
  <div class="k" style="margin-top:1.25in">Databricks · upstream subsurface</div>
  <h1 style="font-size:60px;color:#fff;margin-top:14px">Subsurface Intelligence</h1>
  <p class="lead" style="color:#A6B7C2;font-size:22px">From raw well logs to a located, valued, governed drilling decision, on one platform, in one sitting.</p>
  <div style="margin-top:0.45in;display:flex;gap:44px">
    <div><div style="font-size:46px;font-weight:700;color:#F5A524">${VC['risked']['npv10_musd']:.0f}M</div><div style="font-size:15px;color:#A6B7C2">risked NPV10 of the next well,<br>found in data the team already has</div></div>
    <div><div style="font-size:46px;font-weight:700;color:#2FD39B">{X_BETTER:.1f}x</div><div style="font-size:15px;color:#A6B7C2">lower error filling a missing<br>sonic log than today's method</div></div>
    <div><div style="font-size:46px;font-weight:700;color:#4FB3E8">1 sitting</div><div style="font-size:15px;color:#A6B7C2">from raw logs to a located,<br>priced, governed well</div></div>
  </div>
  <div style="margin-top:0.85in" class="row">
    <span class="chip" style="background:#132836;color:#EEF3F6;border-color:#2B4A5E">Locate</span><span class="arrow">→</span>
    <span class="chip" style="background:#132836;color:#EEF3F6;border-color:#2B4A5E">Read</span><span class="arrow">→</span>
    <span class="chip" style="background:#132836;color:#2FD39B;border-color:#2FD39B">Fill the sonic</span><span class="arrow">→</span>
    <span class="chip" style="background:#132836;color:#F5A524;border-color:#F5A524">Model in voxels</span><span class="arrow">→</span>
    <span class="chip" style="background:#132836;color:#EEF3F6;border-color:#2B4A5E">Value</span><span class="arrow">→</span>
    <span class="chip" style="background:#132836;color:#4FB3E8;border-color:#4FB3E8">Decide</span>
  </div>
  <p class="src" style="position:absolute;bottom:0.45in;color:#6C8494">Working demo on Databricks · Lakeflow · Unity Catalog · MLflow · Model Serving · AI Gateway · Spatial SQL · Genie · Apps</p>
</div>""")

    out.append(f"""<div class="s">
  <div class="k">01 · The decision</div>
  <h2>Where does the next well go, and is it worth drilling? The answer is spread across five systems.</h2>
  <div class="grid c3" style="margin-top:10px">
    <div class="card"><div class="k b">Data in silos</div><h3>Logs, tops, OSDU records, economics, maps</h3><p>Each lives with a different team and tool. Every new question starts with an export and a hand-off.</p></div>
    <div class="card"><div class="k b">Gaps in the record</div><h3>Wells drilled without a key curve</h3><p>A missing sonic log blocks geomechanics and seismic ties. The usual fix is an empirical relation applied by hand.</p></div>
    <div class="card"><div class="k b">AI without guardrails</div><h3>Assistants that cannot see, or ignore, entitlements</h3><p>Either the model has no access to the governed data, or it has too much and partners see what they should not.</p></div>
  </div>
  <div class="callout" style="margin-top:26px">Subsurface Intelligence puts the logs, the geomodel, the economics and the AI on one governed platform, so the decision is one workflow instead of five projects.</div>
  {foot(2)}
</div>""")

    out.append(f"""<div class="s">
  <div class="k">02 · The business value</div>
  <h2>Four levers: a better well, found sooner, without blocked decisions, safe to share</h2>
  <table style="margin-top:4px">
    <tr><th style="width:23%">Lever</th><th style="width:40%">What changes</th><th>The number</th></tr>
    <tr><td><b>1. Value per decision</b></td><td>The geomodel finds and ranks a step-out in data the team already has, and the certified NPV function prices it</td><td><b class="a">${VC['stepout']['npv10_musd']:.0f}M</b> NPV10 unrisked, <b>${VC['risked']['npv10_musd']:.0f}M</b> risked, {VC['risked']['irr_pct']:.0f}% IRR, ${VC['risked']['break_even_wti']:.0f} break-even on ${VC['risked']['capex_musd']:.0f}M capex <span class="badge live">demo</span></td></tr>
    <tr><td><b>2. Speed to decision</b></td><td>Logs to a located, priced proposal in one sitting instead of a chain of exports and hand-offs</td><td>Every <b>6 months</b> of delay costs <b>${DELAY_R:.1f}M</b> of the risked value (<b>${DELAY_U:.1f}M</b> unrisked), {DELAY*100:.1f}% of NPV at 10% <span class="badge live">demo</span>. How long does a step-out proposal take today? <span class="badge ill">yours</span></td></tr>
    <tr><td><b>3. No blocked decisions</b></td><td>Missing curves are filled in seconds by a served model scored against the method engineers trust</td><td><b class="g">{X_BETTER:.1f}x</b> lower error than calibrated Gardner on {M['n_wells']} held-out wells <span class="badge live">demo</span>. How many of your wells lack sonic? <span class="badge ill">yours</span></td></tr>
    <tr><td><b>4. Safe to share</b></td><td>Partners and AI assistants see only what they are entitled to, enforced once in Unity Catalog</td><td>JV partner sees <b>30 of 84</b> rows, interpretation masked, in the app, Genie and SQL <span class="badge live">demo</span></td></tr>
  </table>
  <div class="callout" style="margin-top:22px">The cost side stays small: the sonic model is a scale-to-zero endpoint metered through AI Gateway, the pipeline runs on serverless, and the AI shows its cost per run. Value per decision is in the tens of millions; the platform cost per decision is not.</div>
  {foot()}
</div>""")

    out.append(f"""<div class="s">
  <div class="k">03 · What it does, end to end</div>
  <h2>Six steps, one platform, every number traceable to a governed table</h2>
  <table style="margin-top:6px">
    <tr><th>#</th><th>Step</th><th>What happens</th><th>Databricks</th></tr>
    <tr><td>1</td><td>Locate the wells</td><td>Fleet map with basin footprints and well spacing; the voxel model's proposed step-out per field</td><td>Spatial SQL (ST_ConvexHull, ST_Distance), H3</td></tr>
    <tr><td>2</td><td>Read the logs</td><td>Raw curves, QC flags, corrections, Vcl / porosity / Archie Sw</td><td>Lakeflow SDP bronze → silver → gold</td></tr>
    <tr><td>3</td><td>Fill the missing sonic</td><td>A served model predicts DT where none was logged, scored on held-out wells</td><td>MLflow, UC model registry, Model Serving, AI Gateway</td></tr>
    <tr><td>4</td><td>Model the subsurface</td><td>49,152-cell voxel geomodel kriged from the logs, with uncertainty, ranks a step-out location</td><td>Apps, Unity Catalog</td></tr>
    <tr><td>5</td><td>Value the well</td><td>NPV10, IRR, break-even against WTI</td><td>Certified UC functions, metric views</td></tr>
    <tr><td>6</td><td>Decide with AI</td><td>Supervisor plans specialists, cites evidence, meters cost; Genie answers in plain English</td><td>Agents, AI Gateway, Genie</td></tr>
  </table>
  {foot(3)}
</div>""")

    out.append(f"""<div class="s">
  <div class="k">04 · Fill the missing sonic</div>
  <h2>The model has to beat the method engineers already trust, on wells it never saw</h2>
  <div class="grid" style="grid-template-columns: 1.05fr 1fr; gap: 26px; margin-top: 4px">
    <div>
      <table>
        <tr><th>Method · leave-one-well-out</th><th>MAE µs/ft</th><th>RMSE</th><th>R²</th></tr>
        <tr><td>Gardner, published coefficients</td><td>{GT['mae']:.2f}</td><td>{GT['rmse']:.2f}</td><td>{GT['r2']:.2f}</td></tr>
        <tr><td>Gardner, refit on training wells</td><td>{GC['mae']:.2f}</td><td>{GC['rmse']:.2f}</td><td>{GC['r2']:.2f}</td></tr>
        <tr><td>Faust, refit on training wells</td><td>{FA['mae']:.2f}</td><td>{FA['rmse']:.2f}</td><td>{FA['r2']:.2f}</td></tr>
        <tr><td>Gradient-boosted trees, all curves</td><td>{GB['mae']:.2f}</td><td>{GB['rmse']:.2f}</td><td>{GB['r2']:.3f}</td></tr>
        <tr class="win"><td>Linear, all curves · served</td><td>{CH['mae']:.2f}</td><td>{CH['rmse']:.2f}</td><td>{CH['r2']:.3f}</td></tr>
      </table>
      <p style="font-size:14px;margin-top:10px">{M['n_wells']} wells, {M['n_samples']:,} samples. Whole wells are held out because samples from one well share its geology; a random split would leak. Champion rule: {M['champion_rule']}.</p>
    </div>
    <div>
      <div class="grid c2">
        <div class="tile"><div class="v g">{X_BETTER:.1f}x</div><div class="l">lower error than Gardner calibrated on the same wells</div></div>
        <div class="tile"><div class="v">{CH['mae']:.1f}</div><div class="l">µs/ft mean error on unseen wells</div></div>
      </div>
      <div class="card" style="margin-top:16px"><div class="k">Decision worth defending</div><p>Trees and linear tie at the noise floor, so the simpler model is served: easier to explain to a petrophysicist, cheaper to run, nothing lost. It lives in Unity Catalog as <b>synthetic_sonic@champion</b> behind AI Gateway, and the app falls back to Gardner, labelled, if the endpoint is cold.</p></div>
    </div>
  </div>
  {foot(4)}
</div>""")

    out.append(f"""<div class="s">
  <div class="k">05 · Model the subsurface</div>
  <h2>A voxel geomodel from the logs in under a second, honest about what it does not know</h2>
  <div class="grid" style="grid-template-columns: 1.35fr 1fr; gap: 22px">
    <img class="shot" src="{shots}/voxel_model.png" style="height:4.7in">
    <div>
      <div class="grid c2">
        <div class="tile"><div class="v a">{SO['hcpt_ft']:.0f} ft</div><div class="l">hydrocarbon pore thickness at the step-out, {UPLIFT:.0f}% above the control wells ({SO['control_mean_hcpt_ft']:.0f} ft)</div></div>
        <div class="tile"><div class="v">{SO['risked_hcpt_ft']:.0f} ft</div><div class="l">risked for distance from control (uncertainty {SO['uncertainty']:.2f})</div></div>
      </div>
      <ul style="padding-left:20px;margin-top:16px">
        <li style="font-size:15px">Structure honours every well top; dip, closure and one normal fault are a modeled framework <span class="badge ill">Illustrative</span></li>
        <li style="font-size:15px">Vcl, porosity and Sw from the logs, kriged between wells per stratigraphic sub-layer <span class="badge live">Live</span></li>
        <li style="font-size:15px">Reservoir Sw follows a saturation-height function above the free-water level, so the crest carries more oil than the flank</li>
        <li style="font-size:15px">Step-out {SO['nearest_well_ft']:,} ft from {SO['nearest_well']}, ranked on kriged HCPT and haircut by uncertainty</li>
      </ul>
    </div>
  </div>
  {foot(5)}
</div>""")


    out.append(f"""<div class="s">
  <div class="k">06 · Value the step-out</div>
  <h2>The proposed well, priced by the same certified function the whole platform uses</h2>
  <div class="grid c3" style="margin-top:4px">
    <div class="tile" style="border-color:#9AAAB5"><div class="k" style="color:#566874">Offset · {V['offset_well']}</div><div class="v">${VC['offset']['npv10_musd']:.1f}M</div><div class="l">NPV10 re-priced from scratch · IRR {VC['offset']['irr_pct']:.0f}% · break-even ${VC['offset']['break_even_wti']:.0f}</div></div>
    <div class="tile"><div class="k">Step-out · unrisked</div><div class="v a">${VC['stepout']['npv10_musd']:.1f}M</div><div class="l">HCPT {V['hcpt']['stepout_ft']} ft ({V['hcpt']['scale']:.2f}x the offset) · IRR {VC['stepout']['irr_pct']:.0f}% · payback {VC['stepout']['payback_years']} yr</div></div>
    <div class="tile" style="border-color:#12232E"><div class="k" style="color:#12232E">Step-out · risked</div><div class="v">${VC['risked']['npv10_musd']:.1f}M</div><div class="l">HCPT {V['hcpt']['risked_ft']} ft ({V['hcpt']['risked_scale']:.2f}x) · IRR {VC['risked']['irr_pct']:.0f}% · break-even ${VC['risked']['break_even_wti']:.0f}</div></div>
  </div>
  <div class="grid" style="grid-template-columns: 1.3fr 1fr; gap: 22px; margin-top: 20px">
    <img class="shot" src="{shots}/stepout_value.png" style="height:3.0in;object-position:center 12%">
    <div>
      <div class="card"><div class="k">How it is priced</div><p>The offset's type curve is scaled by the ratio of hydrocarbon pore thickness at the step-out to the offset, the way screening teams scale type curves. Capex (${VC['stepout']['capex_musd']:.0f}M), opex and decline are the offset's. Both wells are priced by <b>calculate_npv10</b> and <b>calculate_break_even</b> in Unity Catalog at ${V['wti']:.2f} WTI, 10 years, 10% discount.</p></div>
      <p style="font-size:14px;margin-top:10px"><span class="badge live">Live</span> HCPT, WTI, the certified functions. <span class="badge ill">Illustrative</span> same well design and cost as the offset; productivity proportional to HCPT. Even risked for distance from control, the well clears its $58M capex with a ${VC['risked']['break_even_wti']:.0f} break-even.</p>
    </div>
  </div>
  {foot()}
</div>""")
    out.append(f"""<div class="s">
  <div class="k">07 · How it is built</div>
  <h2>One pipeline, one registry, one governance layer</h2>
  <div class="uc" style="margin-top:14px"><span class="lbl">UNITY CATALOG · oil_pump_monitor_catalog.subsurface_command</span>
    <div class="row" style="margin-bottom:12px"><span class="lane">LAND</span>
      <div class="box" style="flex:1">UC volume <small>raw LAS-style curves, headers, tops</small></div><span class="arrow">→</span>
      <div class="box" style="flex:1">bronze_logs <small>Auto Loader</small></div><span class="arrow">→</span>
      <div class="box" style="flex:1">silver_logs <small>despike · gaps · range expectations</small></div><span class="arrow">→</span>
      <div class="box" style="flex:1">gold_petrophysics · gold_zone_summary <small>Vcl · φ · Sw · net pay</small></div>
    </div>
    <div class="row" style="margin-bottom:12px"><span class="lane">LEARN</span>
      <div class="box" style="flex:1">gold_sonic_features</div><span class="arrow">→</span>
      <div class="box" style="flex:1">MLflow <small>leave-one-well-out vs Gardner, Faust</small></div><span class="arrow">→</span>
      <div class="box" style="flex:1">synthetic_sonic@champion <small>UC model registry</small></div><span class="arrow">→</span>
      <div class="box" style="flex:1">Model Serving + AI Gateway <small>usage tracking · inference tables · rate limit</small></div>
    </div>
    <div class="row"><span class="lane">SERVE</span>
      <div class="box" style="flex:1">Databricks App <small>voxel model · map · sonic · economics</small></div>
      <div class="box" style="flex:1">Genie <small>19 tables, certified functions</small></div>
      <div class="box" style="flex:1">Subsurface Supervisor <small>specialists · model choice · cost</small></div>
      <div class="box" style="flex:1">Row filters + column masks <small>enforced for app, Genie, SQL</small></div>
    </div>
  </div>
  <p style="font-size:15px;margin-top:16px">One Asset Bundle job, <b>subsurface-command-build</b>, lands the data, runs the pipeline, trains, registers, serves and scores. Rebuilding the whole stack is one command. Cost stays visible: serverless pipeline, a scale-to-zero endpoint with usage tracking and inference tables, and per-run token cost on the Supervisor.</p>
  {foot(6)}
</div>""")

    out.append(f"""<div class="s">
  <div class="k">08 · Govern the data and the AI</div>
  <h2>The same policy holds in the app, in Genie, and in the SQL editor, because it lives in Unity Catalog</h2>
  <div class="grid c3" style="margin-top:6px">
    <div class="card"><div class="k">Row filter</div><h3>JV partners see only their basin</h3><p>gold_zone_summary: an operator sees 84 rows across 4 basins; mapped as a San Juan JV partner, the same query returns 30 rows, San Juan only.</p></div>
    <div class="card"><div class="k">Column mask</div><h3>Interpretation stays in-house</h3><p>Sw and hydrocarbon pore feet return NULL to the partner while net pay stays visible. One function, applied to every consumer.</p></div>
    <div class="card"><div class="k">AI control</div><h3>Choice, cost, control</h3><p>Swap models through AI Gateway with no code change, see token cost per run, guardrails on every call, and agents running as the signed-in user.</p></div>
  </div>
  <div class="callout" style="margin-top:24px">Governance is not an app feature you have to trust; it is the platform. Ask Genie the same question as the partner and the masked columns stay masked.</div>
  {foot(7)}
</div>""")

    out.append(f"""<div class="s">
  <div class="k">09 · What is real, and what is illustrative</div>
  <h2>Every screen says where its numbers come from</h2>
  <table style="margin-top:4px">
    <tr><th>Element</th><th>Status</th><th>Detail</th></tr>
    <tr><td>Pipeline, model, endpoint, policies, Genie</td><td><span class="badge live">Live</span></td><td>Running on Databricks; job, endpoint and policies verified</td></tr>
    <tr><td>Sonic predictions</td><td><span class="badge live">Live</span></td><td>Served model on every request; labelled Gardner fallback if cold</td></tr>
    <tr><td>Voxel properties and step-out</td><td><span class="badge live">Live</span></td><td>Computed in the app from the wells' logs and tops on every load</td></tr>
    <tr><td>Well logs</td><td><span class="badge ill">Synthetic</span></td><td>Physically coupled rock model (porosity, shale, fluids); your logs replace them in the pilot</td></tr>
    <tr><td>Structural framework</td><td><span class="badge ill">Illustrative</span></td><td>Dip, closure and fault are modeled, honoured at the tops; a real horizon model plugs in</td></tr>
    <tr><td>OSDU analog panels</td><td><span class="badge ill">Offline</span></td><td>Fed by a partner ADME workspace that is not live; the panels say so</td></tr>
  </table>
  {foot(8)}
</div>""")

    out.append(f"""<div class="s">
  <div class="k">10 · The path, and the ask</div>
  <h2>Prove it on one field with your logs, then reuse the template</h2>
  <div class="grid c4" style="margin-top:6px">
    <div class="tile"><div class="k" style="color:#566874">Weeks 1–2</div><h3 style="margin:6px 0">Land</h3><div class="l">Your LAS files, tops and headers for one field into a UC volume; same pipeline, your data.</div></div>
    <div class="tile" style="border-color:#9AAAB5"><div class="k" style="color:#566874">Weeks 3–4</div><h3 style="margin:6px 0">Score</h3><div class="l">Retrain the sonic model on your wells; agree the bar it must clear against your current method.</div></div>
    <div class="tile" style="border-color:#9AAAB5"><div class="k" style="color:#566874">Weeks 5–8</div><h3 style="margin:6px 0">Decide</h3><div class="l">Voxel model on your horizons; one step-out reviewed by your geoscientists against their own pick.</div></div>
    <div class="tile" style="border-color:#9AAAB5"><div class="k" style="color:#566874">After</div><h3 style="margin:6px 0">Scale</h3><div class="l">Next field, next missing curve, partner access under the same policies.</div></div>
  </div>
  <div class="grid c2" style="margin-top:24px">
    <div class="card" style="border-color:#EBC48A"><div class="k">Ask 1 · business</div><h3>Name one field and the person who owns its next-well decision</h3><p>Success is a step-out your team agrees is credible, with its value, in weeks instead of a quarter.</p></div>
    <div class="card" style="border-color:#9FCFEA"><div class="k b">Ask 2 · technical</div><h3>A two-week working session with petrophysics and data</h3><p>Map your logs, tops and OSDU records to the pipeline, and agree the acceptance bar for the sonic model.</p></div>
  </div>
  {foot(9)}
</div>""")

    out.append(f"""<div class="s">
  <div class="k">Appendix · the app</div>
  <h2>What you will see</h2>
  <div class="grid c2" style="gap:16px">
    <img class="shot" src="{shots}/spatial_wells.png" style="height:2.75in">
    <img class="shot" src="{shots}/sonic.png" style="height:2.75in">
    <img class="shot" src="{shots}/stepout_value.png" style="height:2.75in">
    <img class="shot" src="{shots}/voxel_model.png" style="height:2.75in;object-position:center 60%">
  </div>
  {foot(10)}
</div>""")
    return out


def main():
    # The demo shows the workflow, the sonic model, the voxel model, the step-out
    # price and governance live, so the deck keeps only the frame around it:
    # the decision, the value, how it is built, and the ask, with what is real
    # vs illustrative held back as an appendix for questions.
    allp = slides()
    pick = lambda key: next(p for p in allp if key in p)
    pages = [allp[0], pick("· The decision"), pick("· The business value"), pick("· How it is built"),
             pick("· The path, and the ask"), pick("· What is real, and what is illustrative")]
    import re
    n = 0
    def kick(m):
        nonlocal n
        n += 1
        return f'<div class="k">{n:02d} · '
    pages = [pages[0]] + [re.sub(r'<div class="k">\d\d · ', kick, p, count=1) for p in pages[1:-1]] + \
            [re.sub(r'<div class="k">\d\d · ', '<div class="k">Appendix · ', pages[-1], count=1)]
    pages = [p.replace("@@PAGE@@", str(i + 1)) for i, p in enumerate(pages)]
    html = f"<!doctype html><html><head><meta charset='utf-8'><link href='https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&family=IBM+Plex+Mono:wght@400;700&display=swap' rel='stylesheet'><style>{CSS}</style></head><body>{''.join(pages)}</body></html>"
    src = HERE / "deck.html"
    src.write_text(html)
    pdf = ROOT / "docs" / "Subsurface-Intelligence-Deck.pdf"
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--virtual-time-budget=8000",
                    f"--print-to-pdf={pdf}", src.as_uri()], check=True, capture_output=True)
    print(pdf)


if __name__ == "__main__":
    main()
