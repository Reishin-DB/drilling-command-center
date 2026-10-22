# Decision brief eval set

Run 257aadfb-3b20-4b7f-90f6-6ecfa3069309 at 2026-10-22 18:56 UTC against the deployed app, one step-out per field (`ml/brief_eval.py`).

**3 of 5 briefs pass** all checks; 5 fully grounded, 3 grounded on the first draft, 2 needed the self-correction pass.

| Well | Model | Grounded | First draft grounded | Figures checked | Facts cited | Sections | Words | Pass |
|---|---|---|---|---|---|---|---|---|
| SANJUAN-01 | databricks-claude-sonnet-4-5 | True | True | 22 | 10/12 | True | 255 | True |
| GREENRIVER-03 | databricks-claude-sonnet-4-5 | True | False (removed 23, 34, 60, 93) | 23 | 10/12 | True | 244 | True |
| PERMIAN-04 | databricks-claude-sonnet-4-5 | True | False (removed 0.5) | 19 | 11/12 | True | 255 | True |
| EASTTEXAS-05 | databricks-claude-sonnet-4-5 | True | True | 26 | 5/12 | True | 265 | False |
| PERMIAN-06 | databricks-claude-sonnet-4-5 | True | True | 25 | 3/12 | True | 250 | False |

## SANJUAN-01

> **Recommendation**
>
> Approve the step-out well 2,616 ft from SANJUAN-01 in the Blanco field [F1].
>
> **Why this well**
>
> • Risked economics deliver $40.3M NPV10, 34% IRR, and 2.0 yr payback at $79.18 WTI with $53 break-even [F5], [F6], meeting corporate hurdles even under subsurface uncertainty.
>
> • Voxel model predicts 253.0 ft hydrocarbon pore thickness vs 238.6 ft at SANJUAN-01 [F2], with risked thickness of 167.5 ft after applying distance-based haircut [F3].
>
> • Synthetic-sonic model demonstrates 3.0 us/ft accuracy on held-out wells, significantly outperforming calibrated Gardner at 10.7 us/ft [F9], reducing reservoir prediction risk.
>
> **Why now**
>
> • Six-month delay costs $1.9M of risked NPV (4.7% erosion) [F8], justifying immediate action in current price environment.
>
> • Structural closure of 158 ft and 140 ft normal fault with free-water level at 9275 ft [F10] support hydrocarbon column retention at this step-out distance.
>
> **Risks and how they are controlled**
>
> • Subsurface uncertainty is 0.68 on 0-to-1 scale due to 2,616 ft step-out distance [F3], [F1], mitigated by conservative risked thickness haircut reducing predicted 253.0 ft to 167.5 ft [F2], [F3].
>
> • H2S measured at 1.2 ppm in SANJUAN-01 [F11] requires no sour-service equipment upgrade ($0.00M capex, 0 weeks lead time) [F12], eliminating cost and schedule exposure.
>
> **Next actions**
>
> • **Asset team**: Finalize AFE using $58M offset well design [F6] within two weeks.
>
> • **VP of Engineering**: Confirm NACE MR0175 compliance strategy given 1.2 ppm H2S profile [F11].
>
> • **SVP Digital Operations**: Authorize drilling with synthetic-sonic model for real-time geosteering [F9].

## GREENRIVER-03

> **Recommendation**
>
> Approve the step-out well 2,643 ft from GREENRIVER-03 with sour-service equipment, delivering $43.0M NPV10 at 39% IRR [F5].
>
> **Why this well**
>
> - Voxel model predicts 232.6 ft hydrocarbon pore thickness at the step-out vs 250.6 ft at GREENRIVER-03 [F2], with risked economics of $43.0M NPV10 and 1.6 yr payback [F5] vs $135.9M at the offset [F7]
> - Break-even WTI of $56 [F5] provides cushion to current $79.18 strip [F6], protecting returns in a downturn
> - Synthetic-sonic model delivers 3.0 us/ft accuracy vs 10.7 us/ft for calibrated Gardner [F9], reducing subsurface risk
>
> **Why now**
>
> - Six-month delay costs $2.0M, or 4.7% of NPV [F8], eroding project value
> - Sour-service equipment lead time of 9 weeks [F12] requires immediate procurement to maintain schedule
>
> **Risks and how they are controlled**
>
> - Model uncertainty 0.68 on 0 to 1 scale [F3] drives haircut from 232.6 ft unrisked to 153.5 ft risked hydrocarbon pore thickness [F2][F3], already reflected in $43.0M risked case [F5]
> - H2S at 32.5 ppm [F11] requires NACE MR0175 sour-service upgrade costing $3.37M [F12], included in $72M capex [F6]
> - Structural complexity with 193 ft closure, 162 ft normal fault, and free-water level at 9292 ft [F10] managed through offset well design [F6]
>
> **Next actions**
>
> - **SVP Digital Operations:** Authorize $72M AFE with sour-service specifications [F6][F12]
> - **VP of Engineering:** Order NACE MR0175 equipment to meet 9 weeks lead time [F11][F12]
> - **Asset team:** Spud immediately to preserve $2.0M delay-cost value [F8]

## PERMIAN-04

> **Recommendation**
>
> Do not drill the step-out well at this time; the risked economics are negative at $-6.0M NPV10 [F5] and further derisking work is required before committing $48M capex [F6].
>
> **Why this well**
>
> - Hydrocarbon pore thickness of 219.2 ft [F2] is nearly identical to the successful PERMIAN-04 offset (220.8 ft [F2]), and unrisked economics are strong at $26.7M NPV10 with 35% IRR [F4]
> - Structural setting provides 178 ft of closure with defined fault and free-water level at 9285 ft [F10], supporting prospectivity
> - Synthetic-sonic model shows improved accuracy (3.0 us/ft vs 10.7 us/ft [F9]), strengthening subsurface confidence
>
> **Why now**
>
> - A six-month delay costs only $0.3M of risked value [F8], making it prudent to derisk before proceeding
> - Sour-service equipment requires 9 weeks lead time [F12], allowing time for additional technical work without schedule impact
>
> **Risks and how they are controlled**
>
> - High subsurface uncertainty (0.68 on 0 to 1 scale [F3]) at 2,643 ft from control [F1] drives risked thickness down to 144.7 ft [F3] and break-even to $87 WTI [F5]; mitigate with additional seismic or a pilot well closer to PERMIAN-04
> - H2S at 44.0 ppm [F11] requires NACE MR0175 compliance [F11] and $3.37M sour-service upgrade [F12]; risk controlled through specification adherence
>
> **Next actions**
>
> - Asset team: acquire additional seismic or evaluate intermediate pilot location to reduce model uncertainty
> - VP of Engineering: pre-qualify sour-service equipment vendors to protect 9 weeks lead time [F12]
> - SVP Digital Operations: validate voxel model with blind well test and quantify value of information for derisking options

## EASTTEXAS-05

> **Recommendation**
>
> Approve the step-out well with sour-service equipment, targeting spud in 24 weeks to capture $66.8M risked NPV10 at 42% IRR [F5].
>
> **Why this well**
>
> - Voxel model predicts 220.3 ft hydrocarbon pore thickness, 9% thicker than EASTTEXAS-05's 202.2 ft, with risked thickness of 145.4 ft still supporting strong economics [F2, F3]
> - Risked NPV10 of $66.8M with 42% IRR and 1.8 yr payback clears hurdles at $46 break-even WTI vs $79.18 current price [F5, F6]
> - Unrisked upside of $149.9M NPV10 at 78% IRR exceeds offset well EASTTEXAS-05's $129.8M, indicating material prize [F4, F7]
>
> **Why now**
>
> - Six-month delay costs $3.1M risked value (4.7% of NPV), justifying immediate action [F8]
> - Sour-service equipment requires 24 weeks lead time, establishing critical path [F12]
>
> **Risks and how they are controlled**
>
> - Subsurface uncertainty is 0.68 on 0-1 scale due to 2,643 ft step-out distance, mitigated by synthetic-sonic model with 3.0 us/ft accuracy vs 10.7 us/ft for calibrated Gardner [F3, F1, F9]
> - High H2S risk at 12000.0 ppm requires NACE MR0175 sour-service equipment, adding $14.35M capex but ensuring safe operations [F11, F12]
> - Structural closure of 192 ft and 173 ft normal fault provide adequate trap definition [F10]
>
> **Next actions**
>
> - **VP of Engineering**: Order NACE MR0175 sour-service equipment immediately to meet 24-week lead time [F12]
> - **Asset team**: Finalize well design and secure rig contract for spud in 24 weeks [F12]
> - **SVP Digital Operations**: Monitor voxel model updates as new data arrives to refine risked thickness estimate [F3]

## PERMIAN-06

> **Recommendation**
>
> Approve the step-out well 2,643 ft from PERMIAN-06 with $44M capex [F1, F6].
>
> **Why this well**
>
> • Delivers $16.8M NPV10 at 26% IRR with 2.2 yr payback and $63 break-even WTI, clearing our hurdle rates even after risking for subsurface uncertainty [F5].
>
> • Hydrocarbon pore thickness of 245.1 ft nearly matches the proven PERMIAN-06 thickness of 246.2 ft, with risked thickness of 161.8 ft still supporting strong economics [F2, F3].
>
> • Unrisked case shows $58.2M NPV10 at 60% IRR, comparable to PERMIAN-06's $58.7M NPV10, confirming upside potential if geology performs as modeled [F4, F7].
>
> **Why now**
>
> • Six-month delay costs $0.8M of risked value (4.7% of NPV), eroding returns in a proven play [F8].
>
> • Structural closure of 178 ft and defined free-water level at 9292 ft de-risk reservoir geometry [F10].
>
> **Risks and how they are controlled**
>
> • Subsurface uncertainty is 0.68 on 0-1 scale due to 2,643 ft step-out distance, but synthetic-sonic model accuracy of 3.0 us/ft vs 10.7 us/ft for calibrated Gardner reduces prediction risk [F3, F9].
>
> • H2S at 2.1 ppm requires NACE MR0175 compliance but adds $0.00M upgrade capex and 0 weeks lead time [F11, F12].
>
> **Next actions**
>
> • SVP Digital Operations: Validate voxel model uncertainty quantification methodology before next step-out.
>
> • VP of Engineering: Confirm NACE MR0175 compliance in completion design and procurement.
>
> • Asset team: Execute AFE and spud within 60 days to preserve value.
