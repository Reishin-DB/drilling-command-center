# Decision brief eval set

Run 2d6b706f-68c0-4c2d-8c2f-868414c46882 at 2026-10-22 19:04 UTC against the deployed app, one step-out per field (`ml/brief_eval.py`).

**5 of 5 briefs pass** all checks; 5 fully grounded, 4 grounded on the first draft, 2 needed the self-correction pass.

| Well | Model | Grounded | First draft grounded | Figures checked | Facts cited | Sections | Words | Pass |
|---|---|---|---|---|---|---|---|---|
| SANJUAN-01 | databricks-claude-sonnet-4-5 | True | False (removed 43, 66) | 23 | 11/12 | True | 230 | True |
| GREENRIVER-03 | databricks-claude-sonnet-4-5 | True | True | 19 | 10/12 | True | 203 | True |
| PERMIAN-04 | databricks-claude-sonnet-4-5 | True | True | 20 | 12/12 | True | 228 | True |
| EASTTEXAS-05 | databricks-claude-sonnet-4-5 | True | True | 22 | 11/12 | True | 221 | True |
| PERMIAN-06 | databricks-claude-sonnet-4-5 | True | True | 21 | 6/12 | True | 203 | True |

## SANJUAN-01

> **Recommendation**
>
> Drill the Blanco step-out well 2,616 ft from SANJUAN-01 immediately [F1].
>
> **Why this well**
>
> • Hydrocarbon pore thickness of 253.0 ft exceeds the proven SANJUAN-01 thickness of 238.6 ft [F2], delivering risked economics of $40.3M NPV10, 34% IRR, and 2.0 yr payback at $79.18 WTI [F5][F6].
>
> • Break-even WTI of $53 provides substantial downside protection in the current $79.18 price environment [F5][F6].
>
> • Risked value of $40.3M NPV10 compares to SANJUAN-01's $92.8M NPV10, representing strong step-out economics despite 0.68 model uncertainty [F5][F7][F3].
>
> **Why now**
>
> • Six-month delay costs $1.9M of risked value (4.7% of NPV) [F8].
>
> **Risks and how they are controlled**
>
> • Subsurface uncertainty is material: risked hydrocarbon thickness of 167.5 ft versus unrisked 253.0 ft reflects 0.68 model uncertainty at 2,616 ft from control [F3][F2][F1], but synthetic-sonic accuracy of 3.0 us/ft versus 10.7 us/ft for calibrated Gardner validates prediction capability [F9].
>
> • H2S risk is low at 1.2 ppm with NACE MR0175 required: False and no sour-service equipment required ($0.00M upgrade, 0 weeks lead time) [F11][F12].
>
> **Next actions**
>
> • Asset team: finalize AFE using $58M offset well design [F6].
>
> • VP of Engineering: confirm NACE MR0175 compliance strategy given 1.2 ppm H2S [F11].
>
> • SVP Digital Operations: authorize drilling with structural parameters (158 ft closure, 140 ft normal fault, 9275 ft free-water level) [F10].

## GREENRIVER-03

> **Recommendation**
>
> Approve the step-out well 2,643 ft from GREENRIVER-03 with sour-service equipment, delivering $43.0M NPV10 at 39% IRR [F5].
>
> **Why this well**
>
> • Strong economics even after risking for distance from control: $43.0M NPV10, 39% IRR, 1.6 yr payback, $56 break-even WTI [F5] on $72M capex [F6], comparable to GREENRIVER-03's $135.9M NPV10 [F7]
> • Risked hydrocarbon pore thickness of 153.5 ft [F3] supports commercial development despite model uncertainty of 0.68 [F3] and haircut from unrisked 232.6 ft [F2]
> • Proven 193 ft closure and 162 ft normal fault structure [F10] de-risks trap integrity
>
> **Why now**
>
> • Six-month delay costs $2.0M of risked value, 4.7% of NPV [F8]
> • Sour-service equipment lead time is 9 weeks [F12], enabling Q2 spud if approved now
>
> **Risks and how they are controlled**
>
> • Subsurface uncertainty 0.68 [F3] addressed through risked case economics [F5] and synthetic-sonic model validated at 3.0 us/ft accuracy [F9]
> • H2S at 32.5 ppm [F11] mitigated with NACE MR0175-compliant equipment [F11] for $3.37M [F12], already in risked capex
>
> **Next actions**
>
> • VP of Engineering: release sour-service equipment RFQ within 2 weeks
> • Asset team: finalize AFE with $3.37M sour upgrade [F12] 
> • SVP Digital Operations: commission pre-drill uncertainty quantification on voxel model [F3]

## PERMIAN-04

> **Recommendation**
>
> Do not drill the step-out well at this time; the risked economics are negative at $-6.0M NPV10 [F5], and a six-month delay to acquire additional subsurface data costs only $-0.3M [F8].
>
> **Why this well**
>
> • Location is 2,643 ft from PERMIAN-04 [F1] with similar unrisked hydrocarbon pore thickness of 219.2 ft vs 220.8 ft [F2], delivering $26.7M NPV10 unrisked [F4], comparable to PERMIAN-04's $27.4M NPV10 [F7]
> • Structural closure of 178 ft and defined free-water level at 9285 ft [F10] support prospectivity
> • Synthetic-sonic model shows improved accuracy at 3.0 us/ft vs 10.7 us/ft for calibrated Gardner [F9]
>
> **Why now**
>
> • Delaying six months costs only $-0.3M of risked value [F8], preserving optionality while subsurface uncertainty (0.68 on 0-1 scale [F3]) is reduced
>
> **Risks and how they are controlled**
>
> • High subsurface uncertainty (0.68 [F3]) haircuts pore thickness to 144.7 ft [F3], driving negative risked economics of $-6.0M NPV10 and $87 break-even WTI vs $79.18 [F5][F6]
> • H2S at 44.0 ppm [F11] requires NACE MR0175 sour-service equipment adding $3.37M capex and 9 weeks lead time [F12]
>
> **Next actions**
>
> • Asset team: acquire seismic or drill appraisal well to reduce model uncertainty before committing $48M capex [F6]
> • VP of Engineering: pre-qualify sour-service equipment to protect 9-week lead time [F12]
> • SVP Digital Operations: validate voxel model uncertainty calibration against drilling outcomes

## EASTTEXAS-05

> **Recommendation**
>
> Approve the step-out well 2,643 ft from EASTTEXAS-05 with sour-service equipment, targeting sanction within 24 weeks to preserve $3.1M of risked value [F8].
>
> **Why this well**
>
> • Delivers $66.8M risked NPV10 at 42% IRR with 1.8-year payback and $46 break-even WTI, well below the $79.18 price deck [F5] [F6]
> • Voxel model predicts 220.3 ft hydrocarbon pore thickness, 9% thicker than the $129.8M NPV10 EASTTEXAS-05 offset [F2] [F7]
> • Synthetic-sonic model demonstrates 3.0 us/ft accuracy on held-out wells, materially better than calibrated Gardner at 10.7 us/ft [F9]
>
> **Why now**
>
> • Six-month delay costs $3.1M (4.7% of risked NPV), justifying immediate action despite subsurface uncertainty [F8]
> • Sour-service equipment requires 24 weeks lead time, gating project schedule [F12]
>
> **Risks and how they are controlled**
>
> • Model uncertainty of 0.68 and 2,643 ft step-out distance haircut unrisked thickness from 220.3 ft to 145.4 ft; risked economics still exceed hurdles [F1] [F2] [F3]
> • H2S measured at 12000.0 ppm requires NACE MR0175 compliance; $14.35M sour-service upgrade included in $65M capex [F11] [F12] [F6]
>
> **Next actions**
>
> • **VP of Engineering**: Order long-lead sour-service equipment within two weeks [F12]
> • **Asset team**: Finalize well design with 192 ft closure and 173 ft fault geometry [F10]
> • **SVP Digital Operations**: Commission pre-drill uncertainty quantification on the voxel model [F3]

## PERMIAN-06

> **Recommendation**
>
> Approve the step-out well 2,643 ft from PERMIAN-06 with $44M capex [F1, F6].
>
> **Why this well**
>
> • Risked economics of $16.8M NPV10, 26% IRR, and 2.2 yr payback clear our hurdle rates even with subsurface uncertainty factored in [F5].
>
> • Hydrocarbon pore thickness of 245.1 ft at the step-out nearly matches the 246.2 ft at PERMIAN-06, supporting commercial development [F2].
>
> • Unrisked value of $58.2M NPV10 comparable to PERMIAN-06's $58.7M NPV10 demonstrates repeatable reservoir quality [F4, F7].
>
> **Why now**
>
> • Six-month delay costs $0.8M of risked value, making immediate execution economically optimal [F8].
>
> • Structural closure of 178 ft and defined free-water level at 9292 ft de-risk trap geometry [F10].
>
> **Risks and how they are controlled**
>
> • Subsurface uncertainty of 0.68 at this step-out distance addressed through risked pore thickness of 161.8 ft in economics [F3].
>
> • Sour service risk minimal with H2S at 2.1 ppm, NACE MR0175 not required, and $0.00M equipment upgrade [F11, F12].
>
> **Next actions**
>
> • Asset team: finalize AFE with $44M capex and $63 break-even WTI [F6, F5].
>
> • VP of Engineering: validate synthetic-sonic model for geosteering [F9].
>
> • SVP Digital Operations: release location for permitting and long-lead procurement.
