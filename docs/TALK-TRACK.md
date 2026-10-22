# Subsurface Intelligence for Landman Oil: talk track

For the FE Bar AI roleplay: about 20 minutes with **Landman Oil**, an illustrative upstream operator whose scale is taken from a public major's 2025 strategy disclosures, and two people in the room.

### Who is in the room

| | SVP Digital Operations (economic buyer) | VP of Engineering (technical owner) |
|---|---|---|
| Owns | The digital and AI program across operations, and the case for funding it | The engineering platforms, integrations and data the program runs on |
| Measured on | Digital value delivered at scale, and the contribution to Landman's **$4 to 5B** structural cost target while production grows toward **2.3 to 2.5 mmboe/d** | Platform reliability, reuse across use cases, security and governance, and engineering delivery speed |
| Pressure | **86%** of energy AI never leaves the pilot; every SaaS tool added is another licence, another copy of the data, another set of access rules | **60 to 70%** of any AI use case is data integration; point solutions rebuild it each time at **3 to 5x** the cost |
| Wants to hear | One field, value in weeks, a template that scales, cost under control | Open formats, one governance layer, it fits the existing stack, the model is proven against today's method |
| Will push on | "What is it worth, and when?" | "Is the model trustworthy, and what breaks when we port it?" |

Shape: **open and discover (3 min) → deck slides 1 to 3, the value (3 min) → live demo (10 min) → recap, then deck slide 4, how it is built (2 min) → deck slide 5, the ask (1 min) → questions.** The deck is six slides on purpose: it frames the value and the ask, and the demo carries the proof. Leave room; the questions are where the score is made.

Every number is tagged so you can defend it: **[demo]** computed live by the app or the training job on the synthetic fleet, **[Landman]** Landman's public-scale figures (a public major's 2025 disclosures), **[benchmark]** industry figure, **[ask]** a number you ask them for.

### Cheat sheet: the run of show on one page

| Time | Where | The one line to land |
|---|---|---|
| 0:00 | Open, two questions each | "One decision that sits on both your growth and your cost target: where the next well goes." |
| 3:00 | Slide 1, title | "$40M risked, found in data you already have; 3.6x lower error than today's method; one sitting." |
| 3:30 | Slide 2, Landman's bet | "Every next-well decision sits on both sides of the bet, and today it runs through several SaaS tools." |
| 4:15 | Slide 3, business value | Six levers, then: "Value per decision is tens of millions; platform cost per decision is not." |
| 6:00 | Demo 1 to 2, wells and logs | "Location is a governed query, not a GIS export." |
| 7:00 | Demo 3, missing sonic | "The model has to beat the method you trust, on wells it never saw." |
| 8:30 | Demo 4, voxel model | "A geomodel in seconds that tells you where it is uncertain." |
| 10:30 | Demo 5, value the well | "$103M unrisked, $40M risked, 34% IRR, priced by the certified function." |
| 11:30 | Demo 8, governance | "Governance is the platform, not an app feature you have to trust." |
| 12:30 | Demo 9, engineer and H2S | "Nobody coded 365 days into this app. HSE owns it, and everything follows it." |
| 14:30 | Recap in the app | Play back their cycle time and their missing-curve problem. |
| 15:00 | Slide 4, how it is built | "One pipeline, one registry, one governance layer, one bundle rebuilds it." |
| 17:00 | Slide 5, the ask | Sponsor one field (SVP); two-week port with petrophysics (VP). Then stop talking. |
| 18:00 | Questions | Section 6 and 7 below. "It ran" questions: open `EXECUTION_EVIDENCE.md`. |

Steps 6, 7 and 10 of the demo are optional; use them if time and the room allow.

## 0. Before you start (10 min ahead)

- **Warm the sonic endpoint.** It scales to zero. Open *Fill the Missing Sonic* once; the chip must read `Live · Model Serving · subsurface-synthetic-sonic`, not `Fallback · Gardner relation`. If it says fallback, wait 60 seconds and reload.
- **Warm the voxel model.** Open *Model the Subsurface* with SANJUAN-01 as the active well. The banner should read **2,616 ft**, **253 ft**, **15% above**, **167.5 ft risked**, and end with the price.
- **Check the step-out price.** On *Value the Well* the card's chip must read `Live · certified UC function`. The dollar figures move with WTI each day: read them off the card, not from this page, if WTI has moved from **$79.18**.
- **Open the app in a fresh browser window** so your session token carries the `sql` and Genie scopes. Check *Governance & Audit*: the "As you" table must show 84 rows, not a scope message.
- **Reset the engineer demo.** In *The rules behind this briefing*, the H2S safety audit interval must read **365**; delete any rehearsal tickets (`DELETE FROM ...engineer_tickets`, `...engineer_action_log`) so the morning starts clean.
- **Reset governance.** The policy button must read "Make me a San Juan JV partner"; if it reads "Restore operator view", click it.
- **Have the deck open** on slide 1 in one window and the app in another, and the two Genie questions ready to paste (section 3, step 7).
- **Reset the camera** on the voxel tab by switching tabs away and back if you rehearsed with it rotated.

## 1. Open and discover (3 min)

**Say:**
> Thanks for the time. Landman has told the market it will grow production toward 2.3 to 2.5 million barrels a day and take 4 to 5 billion dollars of structural cost out at the same time. My goal today is narrow: show you one decision that sits on both, where the next well goes in a field you already produce from, done end to end on Databricks, and get your honest read on whether it would hold up on Landman's data. Two quick questions first.

**Ask the SVP Digital Operations:**
- Which digital programs have made it from pilot to production at Landman, and what stopped the ones that didn't?
- When an asset team proposes the next well in a producing field, how long does it take to get to a located, priced proposal, and how many tools does it pass through? **[ask]**

**Ask the VP of Engineering:**
- Where do Landman's logs, tops and well headers live today, and how many SaaS applications does a next-well proposal touch?
- What would you need to see before you trusted a model to fill a missing curve, or to rank a location?

**Listen for, and reuse later:** the number of hand-offs, weeks or months of cycle time, wells drilled without sonic, distrust of black-box models, partners who need some data but not all. Play their words back at each step.

## 2. The value pitch (3 min) · deck slides 1 to 3, then straight to the app

The deck is the frame; the demo is the proof. Three slides, about a minute each, then switch to the app and do not come back to the deck until after the demo.

### Slide 1 · Title (30 s)
**Say:**
> This is Subsurface Intelligence for Landman: one decision, where the next well goes, taken from raw well logs to a located, priced, governed proposal on one platform. Three numbers to hold onto: a next well worth **$40 million risked**, found in data your team already has; a missing sonic log filled with **3.6 times lower error** than today's method; and all of it in **one sitting**.

### Slide 2 · Landman Oil's bet (45 s)
**Say:**
> Landman is putting about 10 billion dollars a year back into oil and gas, growing toward 2.3 to 2.5 million barrels a day, and taking 4 to 5 billion of structural cost out, all at once **[Landman]**. Every next-well decision sits on both sides of that bet. Today the data to make it lives in several SaaS applications with separate owners, so every proposal is a chain of exports and hand-offs. Gaps make it worse: a well drilled without a sonic log blocks geomechanics until someone patches it by hand. And when AI assistants arrive, they either can't see the governed data or they see too much.

**Tie back:** play back their answer to "how long does a step-out proposal take today?" in their words.

### Slide 3 · The business value (1.5 min)
Walk the six levers top to bottom, then the cost line.

| Lever | Say | The number |
|---|---|---|
| **1. Value per decision** | "The geomodel finds and ranks a step-out in data you already have, and the certified NPV function prices it." | **$103M** NPV10 unrisked, **$40M** risked, **34%** IRR, **$53** break-even on **$58M** capex at $79 WTI **[demo]** |
| **2. Speed to decision** | "Logs to a priced proposal in one sitting instead of a chain of hand-offs. Time has a price." | Every **6 months** of delay costs **$1.9M** of the risked value, **$4.8M** unrisked, **4.7%** of NPV at 10% **[demo]**. "How long does it take you today?" **[yours]** |
| **3. No blocked decisions** | "Missing curves are filled in seconds by a served model scored against the method your petrophysicists trust." | **3.6x** lower error than Gardner refit on the same wells, on **13** held-out wells **[demo]**. "How many of your wells lack sonic?" **[yours]** |
| **4. Safe to share** | "Partners and AI see only what they're entitled to, enforced once in Unity Catalog." | JV partner sees **30 of 84** rows, interpretation masked, in the app, Genie and SQL **[demo]** |
| **5. One platform, many use cases** | "The foundation built for this decision carries the next ten, instead of another stitched SaaS stack." Look at the SVP. | **60 to 70%** of an AI use case's cost is data integration; built once it serves **10+** use cases at **3 to 5x** lower cost, toward the **$4 to 5B** target **[benchmark]** |
| **6. Act the same morning** | "And the engineer who runs the well gets it first thing: an operations agent turns Landman's governed rules into action items, each linked to where it gets closed." Look at the VP of Engineering. | **8** items on the 12,000 ppm H2S well, from an H2S audit **386 days** old to a wellhead spool with **20 days** of cover against a **60-day** lead **[demo]** |

**Cost line, say:** "And the cost side stays small: a scale-to-zero model endpoint metered through AI Gateway, a serverless pipeline, and AI that shows its cost per run. Value per decision is in the tens of millions; the platform cost per decision is not."

### What is new here (if they ask, or work it into slide 2)

> None of the techniques are exotic. Pseudo-sonic from other curves, kriging between wells, saturation-height functions: your team knows all of them. What is new is that they run **as one governed workflow on the platform where the data already is**: the pipeline, the model registry, the served model, the geomodel, the economics, and the AI, with Unity Catalog enforcing who sees what in every one of them.

Lead with "one governed workflow", not "a new algorithm". The first is hard to rebut; the second invites someone to name a vendor.

### Hand-off to the demo
**Say:** "Let me show you every one of those numbers being produced, live." Switch to the app.

## 3. The demo (10 min)

Click path follows the left rail. For each step: **click**, **say**, **land the line**.

### Start Here (20 s)
**Click:** *Start Here*, scroll once so they see the six steps.
**Say:** "Six steps, one decision. I'll go quickly through the first two and spend time on three and four."

### 1. Locate the Wells (1 min)
**Click:** *Locate the Wells*. Point at the KPI strip, then the **Spatial wells** card. Click **Blanco** to fly in.
**Say:** "This is the fleet on a governed map. The basin footprints and the spacing lines are Databricks Spatial SQL over the well table, ST_ConvexHull and ST_Distance, and the queries are on this page. The amber diamond is where the voxel model, which we'll build in a minute, wants the next well."
**Click:** the amber diamond, then point at the inspector card.
**Land:** "Location is a governed query, not a GIS export."

### 2. Read the Logs (45 s)
**Click:** *Read the Logs* (SANJUAN-01).
**Say:** "Raw curves, QC flags, corrected curves, and petrophysics: shale volume from gamma ray, density porosity, Archie water saturation. The pipeline does exactly this QC at scale in the silver layer, with expectations that quarantine bad samples."
**Land:** "Every number downstream traces back to these samples."

### 3. Fill the Missing Sonic (1.5 min) · the model moment
**Click:** *Fill the Missing Sonic*. GREENRIVER-03 is selected; point at the chip `Live · Model Serving`.
**Say:** "Green River 03 was drilled without a sonic log, and geomechanics and seismic ties need one. The green track is the served model's prediction; the dashed purple is Gardner with published coefficients, the relation most teams reach for."
**Point at:** the Evaluation table.
**Say:** "Here's what makes it trustworthy. We hold out **whole wells**, because samples from one well share its geology and a random split would leak. Gardner refit on the training wells: 10.7 microseconds per foot. The served model: **3.0**. Gradient-boosted trees tied the linear model at the noise floor, so we serve the **simpler** one: easier to explain to a petrophysicist and nothing lost."
**Optional, VP of Engineering:** switch to SANJUAN-01, which has measured sonic: "On a well where we can check, the model is within 2.6 against 18.7 for textbook Gardner."
**Land:** "The model has to beat the method you already trust, on wells it never saw. And if the endpoint is cold, the app says so and falls back to Gardner, labelled."

### 4. Model the Subsurface (2 min) · the hero moment
**Click:** *Model the Subsurface*. Let the insight banner read for a second.
**Say:** "This is a voxel geomodel built from those logs, about fifty thousand cells, computed when the page loaded. The structure honours every formation top. Porosity, saturation and shale are kriged between the wells layer by layer, and reservoir saturation follows a saturation-height function above the free-water level, so the crest holds more oil than the flank."
**Click:** **Model uncertainty**.
**Say:** "And this is the part I'd want as an engineer: green at the wells, purple away from them. The model is honest about what it doesn't know."
**Click:** back to **Hydrocarbon pore volume**; drag to orbit once; hover a Westwater voxel.
**Say:** "The step-out it proposes is 2,616 feet from San Juan 01, with 253 feet of hydrocarbon pore thickness, 15% above what the two wells see. Risked for distance from control, 168. And the banner already has the price, which is where we go next. It's a candidate your geoscientists review, not a decision the model makes for them."
**Land:** "A geomodel in the app, in seconds, that tells you where it is uncertain."

### 5. Value the Well (1 min) · the business close
**Click:** *Value the Well* (or *Value the well →* on the voxel banner). Let the top card read.
**Say (SVP Digital Operations):** "Here's what that location is worth. Unrisked, **$103 million** of NPV10. Risked for its distance from control, **$40 million**, a **34%** IRR, paying back in **two years**, and it still breaks even at **$53** oil. On **$58 million** of capex."
**Say (VP of Engineering):** "How it's priced: we take the offset well's type curve and scale it by the ratio of pore thickness at the new location to the offset, the same way screening teams scale type curves. Capex, opex and decline are the offset's. Then both wells are priced from scratch by the **certified Unity Catalog function**, `calculate_npv10`, the same definition Genie, the Supervisor and the portfolio table below use: San Juan 01 shows **$92.8M** in both places." Click **Show SQL**.
**Point at:** the Live and Illustrative tags under the card: "HCPT, price and the function are live; same well design and cost as the offset is the assumption, and it says so."
**Click:** **Write the decision brief** under the card. **Say (to the SVP):** "And this is what lands on your desk: a plain-English brief, why this well and why now, written only from the governed facts on this screen. Every figure carries a citation, and a validator checks each one against the facts before you see it; this one traced all of them. Every brief is logged in Unity Catalog with the model that wrote it."
**Land:** "From logs to a priced well, and a brief the decision owner can act on, in one sitting."

### 6. Decide with AI (1.5 min)
**Click:** *Decide with AI*. Ask about SANJUAN-01 or GREENRIVER-03; let the plan render.
**Say:** "The Supervisor first plans which specialists the question needs and greys out the rest with a reason, then runs those in parallel and synthesises one verdict with citations. Up here, I can swap between frontier and open-weight models through AI Gateway with no code change, and every run shows its cost and the guardrails that ran."
**Land:** "Choice, cost and control over the AI, not just the data."

### 7. Ask the Data (1 min)
**Click:** *Ask the Data* in the header. Paste:
1. "Rank our wells by NPV and show which are economic at 50 dollar WTI"
2. "Which wells are within 50 km of SANJUAN-01 and how far?"

**Say:** "Plain English to governed SQL, grounded in the same tables, metric views and certified functions. Click Show SQL: every answer is auditable."
**Land:** "Anyone can ask the field a question, and the answer is governed SQL."

### 8. Governance & Audit (1 min)
**Click:** *Governance & Audit*. The top panel, **Unity Catalog policy · live**, runs the same query on the gold zone summary as the app and as you: 84 rows across 4 basins on both sides.
**Click:** **Make me a San Juan JV partner**.
**Say:** "I've just mapped myself as a joint-venture partner. Same query, my identity: 30 rows, San Juan only, and saturation and hydrocarbon pore feet are masked while net pay stays visible. That's a row filter and a column mask on the table in Unity Catalog, not code in this app. Because Genie and the Supervisor run as me, they obey it too."
**Click:** **Show policy SQL** if the VP of Engineering leans in, then **Restore operator view**.
**Scroll to:** the **Audit trail** panel. **Say:** "And this is who touched the governed tables and when, read live from Unity Catalog's audit log as you, so it obeys your permissions too. Today's policy change lands here once the audit log catches up, usually within the hour."
**Land:** "Governance is the platform, not an app feature you have to trust."

### 9. The engineer's morning (2 min) · H2S well, then Genie
**Click:** the persona switch in the header, **Engineer**. Let the notifications slide in; point at the bell.
**Say (to the VP of Engineering):** "Same platform, different person. This is a production engineer arriving in the morning. The operations agent has already checked the governed rules against this morning's data and found eight open action items on East Texas 05, the 12,000 ppm extreme-sour well."
**Click:** a notification, or *Morning Action Items*. Point at the agent note and its **Grounded** chip, then the top card.
**Say:** "Every item comes from business context the business owns: a glossary term with its threshold and owner, and a rule that is a governed query over Unity Catalog. The H2S safety audit is 386 days old against a 365-day interval. Three sour-critical parts will stock out before a reorder lands; the wellhead spool has 20 days of cover against a 60-day lead time. Each item links to where it gets closed: the sour-service dashboard, the Equipment tab with this well selected, the source table, or a ticket."
**Click:** **Show the glossary and rules** in *The rules behind this briefing*. Point at the **H2S safety audit interval** row: definition, owner HSE, threshold **365** days.
**Say:** "Here's the part I want you to see. Nobody coded 365 days into this app. It's a governed glossary term that HSE owns, in Unity Catalog, and the rule reads it. Watch." Change it to **400**, click **Apply**.
**Say:** "The audit item is gone, because 386 days is now inside the interval, and the agent rewrote its note. The business changed the policy; the briefing followed, with no code and no deploy. The same definition is what Genie and the dashboard read." Set it back to **365** and Apply; the item returns. Click **Show SQL** on R-H2S-AUDIT if the VP of Engineering leans in.
**Optional, for the VP of Engineering:** click **business_glossary in Catalog Explorer ↗**. Show the Sample data (the 365 row, owner HSE), then open `v_engineer_rule_catalog`: every rule with its definition, owner, live threshold and open items today. On `well_h2s_profile`, point at the `glossary_term` tag on `last_safety_audit_date`. "The meaning is on the data itself, governed in Unity Catalog."
**Click:** **Create reorder ticket** on the wellhead spool (a `SUB-` ticket appears, written to UC), then **Ask Genie why** on the audit item.
**Say:** "And if the engineer wants to know why, Genie answers from the same rule, the same glossary definition and the same data, with the SQL to prove it."
**If you have a minute, paste one or two of these into Genie** (all eight were run live and are recorded in `docs/evidence/16_h2s_proof_points.md`):
1. "Why is EASTTEXAS-05 flagged for an H2S safety audit? Show the rule, its glossary definition and the data behind it." Genie names **R-H2S-AUDIT**, the **365-day** glossary interval, and **386 days** since the 2025-10-01 audit.
2. "Which wells are sour, and what is each one's H2S severity band and last measured ppm?" Genie returns EASTTEXAS-05 **extreme** at **12,000 ppm**, PERMIAN-04 and GREENRIVER-03 **moderate**.
3. "Which wellhead and casing parts will stock out before a reorder arrives?" Genie returns **3 parts**, the casing joint at **7.2 days** of cover against a **35-day** lead.

**Say:** "Notice it opens with the H2S hazard banner. That's an instruction HSE put on the space, so every sour-well answer starts with the safety checks." If the VP of Engineering asks how you know Genie gets it right: "We ran these as proof points. The first time, Genie called this well 'high' because it read an HSE risk field instead of the governed severity band. We pointed its instructions at the glossary's source, re-ran, and it says extreme. That loop is recorded."
**Land:** "The agent, the dashboard, the ticket and Genie all read one governed definition of what matters this morning."

### 10. How It Works (30 s, or skip if short on time)
**Click:** *How It Works*.
**Say:** "Volume, Lakeflow bronze, silver, gold, MLflow against the baselines, the model registry, Model Serving behind AI Gateway, then the app, Genie and the Supervisor. One Asset Bundle job rebuilds it."

### Recap before you leave the app (30 s)
**Say:** "So, back to what you told me at the start." Play back their cycle time and their missing-curve problem, then: "We filled the sonic on a well that had none, built the geomodel, found a step-out worth $40 million risked, priced it with your governed NPV, and the partner could only see their basin. One sitting, one platform."
**Ask:** "Is that the kind of candidate your team would want to start from?" Then switch back to the deck.

## 4. How it is built, and the decisions behind it (2 min) · deck slide 4, appendix slide 6 for questions

**Say on slide 4:** "One pipeline, one registry, one governance layer. Everything you saw lives in one Unity Catalog schema, and one Asset Bundle job rebuilds it: lands the data, runs the pipeline, trains, registers, serves, scores."

Then say these as decisions you made, each with the reason:

- **Held-out wells, not rows.** Samples from one well share a geology; a random split would leak and flatter the model.
- **The baseline is the method they use.** Gardner, and Gardner refit on the same training wells, so the comparison is fair. The textbook version is shown too, because it's what most people apply.
- **Simplest model that ties wins.** Trees and linear tied at 3.0; the linear model is served.
- **Fallback is labelled.** If the endpoint is cold the app uses Gardner and says so on screen. No silent degradation.
- **The geomodel states its uncertainty.** Kriging standard deviation is an attribute you can show, and the ranking is haircut by it.
- **Policies live in Unity Catalog.** The row filter and column mask are SQL functions on the tables, so the app, Genie, and the SQL editor all obey them.
- **Every screen tags Live vs Illustrative.** Appendix slide 6 lists exactly what is synthetic.

## 5. The ask (1 min) · deck slide 5

> Here's what I'd propose. **To the SVP Digital Operations:** sponsor one Landman field as the first production use case. Success is a step-out the asset team agrees is credible, priced with Landman's own type curves and costs, in weeks rather than a quarter, and a template that takes the next field out of pilot and counts toward the 4 to 5 billion cost target. **To the VP of Engineering:** a two-week working session with petrophysics and data to port the bundle into Landman's workspace, map Landman's logs, tops and OSDU records to the pipeline, and agree the bar the sonic model has to clear against your current method.

Then stop talking.

## 6. Objection handling

**"This is synthetic data. Why should I believe it?"**
> It is, and every screen says so. What's real is the machinery: the pipeline, the evaluation design, the served model, the policies. The rock model behind the logs is physically coupled, porosity drives density, neutron and sonic together, so the model has to learn real relationships. The pilot replaces the logs with yours, and the evaluation re-runs on your wells against your current method. If it doesn't beat it, you'll see that too.

**"Kriging between two wells isn't a geomodel."**
> Agreed, and the model says so: with one or two wells the uncertainty attribute goes purple quickly, and the step-out is haircut for it. The point isn't that this replaces Petrel; it's that a defensible first look, with its uncertainty, is available in seconds on governed data, so the geoscientist starts from a ranked, explained candidate.

**"We already have Petrel / Techlog for this."**
> Keep them. This isn't a replacement for the interpretation workstation; it's the governed data and AI layer under it. The logs, tops and models land once in Unity Catalog, the missing curves are filled and versioned, and the interpretation tools, the economics and the AI all read the same governed copy.

**"Why linear and not deep learning?"**
> Because it tied. We tried gradient-boosted trees; on held-out wells they matched the linear model at 3.0. When two models tie, the simpler one is easier to explain, cheaper to serve, and harder to break. On your data we'd re-run the same bake-off.

**"How do I know the model isn't overfit?"**
> Leave-one-well-out. Every score in that table is on a well the model never saw in training. On San Juan 01, which has measured sonic, it's within 2.6 microseconds per foot.

**"Why scale production by pore thickness?"**
> It's the standard screening shortcut: the offset is the best evidence of how this rock produces, and the type curve is scaled by a reservoir-quality ratio. Pore thickness is a reasonable proxy here; with your data we'd use your type curves and your own scaling, kh if you have the permeability. The point is the workflow: the geomodel output flows straight into the governed economics.

**"Is that the same NPV I'd get from Genie or the Supervisor?"**
> Yes, to the cent. Every NPV in the app, the step-out, its offset, the portfolio table, Genie's answers and the Supervisor's economics specialist, comes from the same certified Unity Catalog function at today's price. That's the point of governing the definition, not just the data.

**"The OSDU panels say offline."**
> They're fed by a partner ADME workspace that isn't live right now, and the app says so instead of faking it. The connector pattern is the same; on your OSDU instance those panels light up.

**"What does this cost to run?"**
> The sonic model is a small endpoint that scales to zero, behind AI Gateway with usage tracking and inference tables, so you see the cost per call. The Supervisor shows token cost per run. The rest is pipeline and SQL on serverless.

**"Is this an ontology, or just some tables?"**
> It's an ontology in the Databricks sense: governed Unity Catalog objects, not a separate graph product you copy data into. The glossary defines the business terms with owners and thresholds, each term is tagged on the columns it governs, primary and foreign keys connect tickets to rules to glossary terms and to wells, and metric views and certified functions hold the canonical measures and logic. The agent, the dashboard and Genie all read the same definitions, so when HSE changes a threshold, everything follows.

**"How do I know this actually ran, and isn't a mock-up?"**
> Every number has a receipt. `EXECUTION_EVIDENCE.md` at the top of the repo is captured output, not code: the job logs with the printed model metrics, a live call to the served model and its response, the rows AI Gateway logged, Genie's answers with the SQL it wrote, the policy check before and after, the drift retrains, the eval runs and the audit log. And the app tags every panel Live or Illustrative.

**"Can partners query this through Genie and see too much?"**
> No. The row filter and column mask are on the tables in Unity Catalog, and Genie runs as the signed-in user. The partner sees 30 rows, San Juan only, with the masked columns NULL, whichever tool they use.

## 7. Questions to expect from the VP of Engineering

- *How are the logs QC'd?* Silver despikes, flags gaps and range violations with pipeline expectations; bad samples are excluded from training and from the model's inputs.
- *What are the model inputs?* GR, RHOB, NPHI, log10 RT and depth.
- *Where is the model?* `oil_pump_monitor_catalog.subsurface_command.synthetic_sonic`, alias `@champion`, served on `subsurface-synthetic-sonic`.
- *How is the step-out priced?* Offset type curve scaled by HCPT ratio (1.06x unrisked, 0.70x risked), offset capex $58M, opex and 18%/yr decline, priced by `calculate_npv10` and `calculate_break_even` at today's WTI over 10 years at 10%. IRR and payback come from the same cash flows in the app.
- *How is the step-out ranked?* Undrilled columns between 2,500 ft and one correlation range from control are ranked on kriged hydrocarbon pore thickness, times one minus half the column's kriging uncertainty.
- *What happens when the model drifts?* A drift job scores the served model on every well with measured sonic against two bars: 1.5x its validated error, and calibrated Gardner. Today 0 of 13 wells drift. A simulated new well with a neutron-tool calibration shift went to 5.4 us/ft against a 4.5 bar, and the job retrained the model automatically. A second failure mode, a gamma-ray tool change, was also detected and retrained; the champion is now version 4.
- *Is the AI brief making numbers up?* No: it may only use numbered governed facts, a validator rejects any figure that is not in them, and each brief is logged to `gold_action_plans` with its facts, prompt, model and result. An eval set runs one brief per field: it passed 3 of 5, then 4 of 5, then 5 of 5 after two fixes, and the history is a table in Unity Catalog (`gold_brief_eval`).
- *Does the partner policy cover equipment and H2S?* Yes: the same row filter and typed masks hide upgrade capex, risk scores and notes, but H2S concentration stays visible because safety data is never masked.
- *Where do the engineer's action items come from?* `engineer_rules`: each rule is a read-only governed SELECT tied to a `business_glossary` term with its threshold and owner; the app runs them, refuses anything that is not a single SELECT, and writes tickets and close-outs back to `engineer_tickets` and `engineer_action_log`. Change a threshold in the glossary and tomorrow's briefing changes, no code.
- *How do I rebuild it?* `databricks bundle deploy -t fevm` then run the `subsurface-command-build` job.

## 8. Reading the room

- If the **SVP Digital Operations** drifts during step 3, skip the optional measured-well check and go straight to the voxel banner.
- If the **VP of Engineering** leans in on step 4, toggle uncertainty and pay-only, and offer the method panel on the right.
- After step 4, check in with both: "Is that the kind of candidate your team would want to start from?"
- If time is short, cut step 10 and shorten step 6 to the model picker and cost meter. Keep step 9 if the VP of Engineering is the stronger voice in the room.

## 9. The 10-minute version

If the slot shrinks: slide 1 (20 s), slide 3 (1 min), then demo steps 3, 4, 5 and 8 only (6 min): fill the sonic, the voxel model, the step-out price, and the JV partner toggle. Recap in one sentence, slide 5, the ask. Everything else goes into the questions.
