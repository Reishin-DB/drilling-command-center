# Subsurface Intelligence: talk track

For the FE Bar AI roleplay: about 20 minutes with two personas, a **business stakeholder** (asset manager or VP subsurface, owns the next-well decision and the capex) and a **technical stakeholder** (petrophysics or subsurface data lead, owns whether this is trustworthy and fits the stack). Scored on demo setup, value communication, reading the room, and professionalism.

Shape: **open and discover (3 min) → deck slides 1 to 3, the value (3 min) → live demo (10 min) → recap, then deck slide 4, how it is built (2 min) → deck slide 5, the ask (1 min) → questions.** The deck is six slides on purpose: it frames the value and the ask, and the demo carries the proof. Leave room; the questions are where the score is made.

Every number is tagged so you can defend it: **[demo]** computed live by the app or the training job on the synthetic fleet, **[yours]** a number you ask them for. There are no industry-benchmark dollar figures in this track on purpose; if they ask for one, turn it into a **[yours]** question.

## 0. Before you start (10 min ahead)

- **Warm the sonic endpoint.** It scales to zero. Open *Fill the Missing Sonic* once; the chip must read `Live · Model Serving · subsurface-synthetic-sonic`, not `Fallback · Gardner relation`. If it says fallback, wait 60 seconds and reload.
- **Warm the voxel model.** Open *Model the Subsurface* with SANJUAN-01 as the active well. The banner should read **2,616 ft**, **253 ft**, **15% above**, **167.5 ft risked**, and end with the price.
- **Check the step-out price.** On *Value the Well* the card's chip must read `Live · certified UC function`. The dollar figures move with WTI each day: read them off the card, not from this page, if WTI has moved from **$79.18**.
- **Open the app in a fresh browser window** so your session token carries the `sql` and Genie scopes. Check *Governance & Audit*: the "As you" table must show 84 rows, not a scope message.
- **Reset governance.** The policy button must read "Make me a San Juan JV partner"; if it reads "Restore operator view", click it.
- **Have the deck open** on slide 1 in one window and the app in another, and the two Genie questions ready to paste (section 3, step 7).
- **Reset the camera** on the voxel tab by switching tabs away and back if you rehearsed with it rotated.

## 1. Open and discover (3 min)

**Say:**
> Thanks for the time. My goal today is narrow: show you one subsurface decision, where the next well goes in a field you already produce from, done end to end on Databricks, and get your honest read on whether it would hold up on your data. Before I start, two quick questions so I aim this at what matters to you.

**Ask the business persona:**
- When the team proposes the next well in a producing field, how long does it take to get from "we think there is room" to a located, priced proposal? Who touches it?
- What happens to that decision when a key log is missing on a nearby well?

**Ask the technical persona:**
- Where do your logs, tops, and well headers live today, and how do they get into the geomodel?
- What would you need to see before you trusted a model to fill a missing curve, or to rank a location?

**Listen for, and reuse later:** the number of hand-offs, weeks or months of cycle time, wells drilled without sonic, distrust of black-box models, partners who need some data but not all. Play their words back at each step.

## 2. The value pitch (3 min) · deck slides 1 to 3, then straight to the app

The deck is the frame; the demo is the proof. Three slides, about a minute each, then switch to the app and do not come back to the deck until after the demo.

### Slide 1 · Title (30 s)
**Say:**
> This is Subsurface Intelligence: one decision, where the next well goes, taken from raw well logs to a located, priced, governed proposal on one platform. Three numbers to hold onto: a next well worth **$40 million risked**, found in data your team already has; a missing sonic log filled with **3.6 times lower error** than today's method; and all of it in **one sitting**.

### Slide 2 · The decision (45 s)
**Say:**
> The data to place the next well already exists: logs, tops, headers, OSDU records, economics. It lives in five places with five owners, so every new question starts with an export and a hand-off. Gaps make it worse: a well drilled without a sonic log blocks geomechanics until someone patches it by hand. And when AI assistants arrive, they either can't see the governed data or they see too much.

**Tie back:** play back their answer to "how long does a step-out proposal take today?" in their words.

### Slide 3 · The business value (1.5 min)
Walk the four levers top to bottom, then the cost line.

| Lever | Say | The number |
|---|---|---|
| **1. Value per decision** | "The geomodel finds and ranks a step-out in data you already have, and the certified NPV function prices it." | **$103M** NPV10 unrisked, **$40M** risked, **34%** IRR, **$53** break-even on **$58M** capex at $79 WTI **[demo]** |
| **2. Speed to decision** | "Logs to a priced proposal in one sitting instead of a chain of hand-offs. Time has a price." | Every **6 months** of delay costs **$1.9M** of the risked value, **$4.8M** unrisked, **4.7%** of NPV at 10% **[demo]**. "How long does it take you today?" **[yours]** |
| **3. No blocked decisions** | "Missing curves are filled in seconds by a served model scored against the method your petrophysicists trust." | **3.6x** lower error than Gardner refit on the same wells, on **13** held-out wells **[demo]**. "How many of your wells lack sonic?" **[yours]** |
| **4. Safe to share** | "Partners and AI see only what they're entitled to, enforced once in Unity Catalog." | JV partner sees **30 of 84** rows, interpretation masked, in the app, Genie and SQL **[demo]** |

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
**Optional, technical persona:** switch to SANJUAN-01, which has measured sonic: "On a well where we can check, the model is within 2.6 against 18.7 for textbook Gardner."
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
**Say (business persona):** "Here's what that location is worth. Unrisked, **$103 million** of NPV10. Risked for its distance from control, **$40 million**, a **34%** IRR, paying back in **two years**, and it still breaks even at **$53** oil. On **$58 million** of capex."
**Say (technical persona):** "How it's priced: we take the offset well's type curve and scale it by the ratio of pore thickness at the new location to the offset, the same way screening teams scale type curves. Capex, opex and decline are the offset's. Then both wells are priced from scratch by the **certified Unity Catalog function**, `calculate_npv10`, the same definition Genie and the Supervisor use." Click **Show SQL**.
**Point at:** the Live and Illustrative tags under the card: "HCPT, price and the function are live; same well design and cost as the offset is the assumption, and it says so."
**Land:** "From logs to a priced well in one sitting, with one governed definition of NPV."

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
**Click:** **Show policy SQL** if the technical persona leans in, then **Restore operator view**.
**Land:** "Governance is the platform, not an app feature you have to trust."

### 9. How It Works (30 s, or skip if short on time)
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

> Here's what I'd propose. **Business:** name one field and the person who owns its next-well decision. Success is a step-out your team agrees is credible, priced with your own type curves and costs, in weeks rather than a quarter. **Technical:** a two-week working session with petrophysics and data to map your logs, tops and OSDU records to this pipeline, and agree the bar the sonic model has to clear against your current method.

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

**"Why does the portfolio table show a different NPV for San Juan 01?"**
> Good catch. The table shows the original underwriting NPV re-rated for today's price. The step-out card re-prices both wells from scratch with the certified function so the comparison is like for like, and the card says that underneath.

**"The OSDU panels say offline."**
> They're fed by a partner ADME workspace that isn't live right now, and the app says so instead of faking it. The connector pattern is the same; on your OSDU instance those panels light up.

**"What does this cost to run?"**
> The sonic model is a small endpoint that scales to zero, behind AI Gateway with usage tracking and inference tables, so you see the cost per call. The Supervisor shows token cost per run. The rest is pipeline and SQL on serverless.

**"Can partners query this through Genie and see too much?"**
> No. The row filter and column mask are on the tables in Unity Catalog, and Genie runs as the signed-in user. The partner sees 30 rows, San Juan only, with the masked columns NULL, whichever tool they use.

## 7. Questions to expect from the technical persona

- *How are the logs QC'd?* Silver despikes, flags gaps and range violations with pipeline expectations; bad samples are excluded from training and from the model's inputs.
- *What are the model inputs?* GR, RHOB, NPHI, log10 RT and depth.
- *Where is the model?* `oil_pump_monitor_catalog.subsurface_command.synthetic_sonic`, alias `@champion`, served on `subsurface-synthetic-sonic`.
- *How is the step-out priced?* Offset type curve scaled by HCPT ratio (1.06x unrisked, 0.70x risked), offset capex $58M, opex and 18%/yr decline, priced by `calculate_npv10` and `calculate_break_even` at today's WTI over 10 years at 10%. IRR and payback come from the same cash flows in the app.
- *How is the step-out ranked?* Undrilled columns between 2,500 ft and one correlation range from control are ranked on kriged hydrocarbon pore thickness, times one minus half the column's kriging uncertainty.
- *How do I rebuild it?* `databricks bundle deploy -t fevm` then run the `subsurface-command-build` job.

## 8. Reading the room

- If the **business persona** drifts during step 3, skip the optional measured-well check and go straight to the voxel banner.
- If the **technical persona** leans in on step 4, toggle uncertainty and pay-only, and offer the method panel on the right.
- After step 4, check in with both: "Is that the kind of candidate your team would want to start from?"
- If time is short, cut step 9 and shorten step 6 to the model picker and cost meter.

## 9. The 10-minute version

If the slot shrinks: slide 1 (20 s), slide 3 (1 min), then demo steps 3, 4, 5 and 8 only (6 min): fill the sonic, the voxel model, the step-out price, and the JV partner toggle. Recap in one sentence, slide 5, the ask. Everything else goes into the questions.
