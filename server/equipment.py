"""Oilfield equipment integrity engine — H2S / sour-service impact.

Single deterministic source of truth for the equipment story: given a well's
H2S profile (ppm, sour classification) it derives, component by component, the
metallurgical consequence under NACE MR0175 / ISO 15156, the required upgrade,
the capex premium, and the procurement lead-time delta.

Consumed by all three surfaces so they never disagree:
  • the Supervisor's Equipment Integrity specialist  (server/routes/supervisor.py)
  • the Oilfield Equipment tab                        (server/routes/equipment.py)
  • Genie / the ontology                              (well_equipment_integrity + UC fn)

Nothing here touches the network. It is pure functions over an H2S profile dict,
so it is instant, demo-safe, and identical everywhere it runs.

Domain basis (kept deliberately explicit for the demo narrative)
----------------------------------------------------------------
A well becomes "sour" once the H2S partial pressure clears ~0.05 psia. Sour
service drives three failure mechanisms:
  • SSC   — Sulfide Stress Cracking (hard, high-strength steels crack)
  • HIC   — Hydrogen-Induced Cracking / SOHIC (blistering in the steel)
  • wt.   — accelerated weight-loss corrosion (needs inhibition + allowance)
The controls are controlled-hardness sour-service metallurgy (e.g. L80 Type 1
rather than P110 tubulars), sour trim on the wellhead/tree/valves, elastomers
rated for sour + explosive decompression (HNBR / Aflas / FKM), corrosion-
resistant-alloy (CRA) or inhibited carbon steel flowlines, and, for artificial
lift, ESP metallurgy + elastomer upgrades that shorten expected run-life.
"""
from __future__ import annotations

# ── Sour-severity banding ────────────────────────────────────────────────────
# ppm here is the last-measured reservoir/gas H2S concentration carried on
# well_h2s_profile.h2s_ppm_last_measured. The bands map to how aggressive the
# metallurgy / monitoring response has to be. Thresholds are demo-calibrated but
# consistent with common sour-service practice.
SEVERITY_BANDS = [
    # (min_ppm_inclusive, band, label, headline)
    (10000, "extreme", "Extreme sour", "Extreme sour service — full CRA / sour trim, longest lead times"),
    (2000,  "high",    "High sour",    "High sour service — controlled-hardness metallurgy across the string"),
    (100,   "moderate","Moderate sour","Moderate sour service — sour-rated wetted components required"),
    (10,    "low",     "Low / trace",  "Low H2S — monitor and inhibit; standard-plus components acceptable"),
    (0,     "sweet",   "Sweet",        "Sweet service — standard oilfield metallurgy is adequate"),
]

# Ordered worst→best so we can compare bands numerically.
_BAND_RANK = {"extreme": 4, "high": 3, "moderate": 2, "low": 1, "sweet": 0}

# Health / risk colour tokens reused by the UI (match index.css var names).
_RISK_TONE = {
    "extreme": "red", "high": "red", "moderate": "amber", "low": "gold", "sweet": "green",
}


def severity_for(ppm: float | int | None, sour_classified: bool | None) -> dict:
    """Classify a well into a sour-severity band from its H2S ppm.
    A well flagged sour_classified is never allowed below the 'moderate' band,
    so the governed classification always wins over a stale/low ppm reading."""
    try:
        p = float(ppm) if ppm is not None else 0.0
    except (TypeError, ValueError):
        p = 0.0
    band = "sweet"
    label = "Sweet"
    headline = SEVERITY_BANDS[-1][3]
    for min_ppm, b, lbl, head in SEVERITY_BANDS:
        if p >= min_ppm:
            band, label, headline = b, lbl, head
            break
    if sour_classified and _BAND_RANK[band] < _BAND_RANK["moderate"]:
        band, label = "moderate", "Moderate sour (classified)"
        headline = "Governed sour classification overrides low ppm — sour-rated components required"
    return {"ppm": round(p, 1), "band": band, "label": label,
            "headline": headline, "tone": _RISK_TONE[band], "rank": _BAND_RANK[band]}


# ── Component catalogue ──────────────────────────────────────────────────────
# Each component names, per band, the required spec, the dominant degradation
# mechanism, a 0-100 risk score if it were left as the sweet-service baseline,
# the capex premium (USD, MM) over the sweet baseline, and the added lead time
# (weeks) to procure the sour-rated variant. "group" drives the tab's sections:
#   downhole  · esp  · surface
COMPONENTS = [
    # ── Downhole / completion ────────────────────────────────────────────────
    {
        "id": "tubulars", "group": "downhole", "name": "Production tubulars / casing",
        "baseline": "P110 high-strength carbon steel",
        "specs": {
            "sweet":    "P110 (standard)",
            "low":      "L80 Type 1 (controlled hardness)",
            "moderate": "L80 Type 1, HRC ≤ 22 (NACE MR0175)",
            "high":     "L80 / 13Cr sour grade, HIC-tested",
            "extreme":  "25Cr super-duplex CRA",
        },
        "mechanism": {"sweet": "none", "low": "SSC", "moderate": "SSC",
                      "high": "SSC + HIC", "extreme": "SSC + HIC + wt. loss"},
        "risk":  {"sweet": 5, "low": 45, "moderate": 68, "high": 85, "extreme": 96},
        "capex": {"sweet": 0.0, "low": 0.35, "moderate": 0.9, "high": 1.8, "extreme": 3.6},
        "lead":  {"sweet": 0, "low": 3, "moderate": 6, "high": 10, "extreme": 18},
    },
    {
        "id": "wellhead", "group": "downhole", "name": "Wellhead & Christmas tree",
        "baseline": "AA/EE standard trim",
        "specs": {
            "sweet":    "API 6A AA trim",
            "low":      "API 6A DD trim",
            "moderate": "API 6A EE-NL sour trim",
            "high":     "API 6A FF sour trim (NACE)",
            "extreme":  "API 6A HH CRA-clad sour trim",
        },
        "mechanism": {"sweet": "none", "low": "SSC", "moderate": "SSC",
                      "high": "SSC + HIC", "extreme": "SSC + HIC"},
        "risk":  {"sweet": 4, "low": 40, "moderate": 62, "high": 80, "extreme": 92},
        "capex": {"sweet": 0.0, "low": 0.2, "moderate": 0.55, "high": 1.1, "extreme": 2.2},
        "lead":  {"sweet": 0, "low": 4, "moderate": 8, "high": 14, "extreme": 22},
    },
    {
        "id": "packer_elastomers", "group": "downhole", "name": "Packers & downhole elastomers / seals",
        "baseline": "Nitrile (NBR) seals",
        "specs": {
            "sweet":    "NBR elastomers",
            "low":      "HNBR elastomers",
            "moderate": "HNBR, ED-rated",
            "high":     "Aflas (FEPM), ED-rated",
            "extreme":  "FFKM / Aflas, ED + high-temp rated",
        },
        "mechanism": {"sweet": "none", "low": "swell/ED", "moderate": "explosive decompression",
                      "high": "explosive decompression", "extreme": "ED + thermal"},
        "risk":  {"sweet": 6, "low": 38, "moderate": 60, "high": 78, "extreme": 90},
        "capex": {"sweet": 0.0, "low": 0.08, "moderate": 0.18, "high": 0.4, "extreme": 0.75},
        "lead":  {"sweet": 0, "low": 2, "moderate": 4, "high": 7, "extreme": 12},
    },
    # ── ESP / artificial lift ────────────────────────────────────────────────
    {
        "id": "esp_metallurgy", "group": "esp", "name": "ESP pump & motor metallurgy",
        "baseline": "Standard Ni-resist / carbon steel",
        "specs": {
            "sweet":    "Standard Ni-resist",
            "low":      "Ni-resist + monel hardware",
            "moderate": "Duplex SS stages, monel bolting",
            "high":     "Super-duplex stages, Inconel shafts",
            "extreme":  "Full Inconel / Hastelloy wetted path",
        },
        "mechanism": {"sweet": "none", "low": "pitting", "moderate": "SSC + pitting",
                      "high": "SSC + HIC", "extreme": "SSC + HIC + erosion"},
        "risk":  {"sweet": 8, "low": 44, "moderate": 66, "high": 83, "extreme": 95},
        "capex": {"sweet": 0.0, "low": 0.15, "moderate": 0.42, "high": 0.85, "extreme": 1.6},
        "lead":  {"sweet": 0, "low": 4, "moderate": 9, "high": 15, "extreme": 24},
    },
    {
        "id": "esp_elastomers", "group": "esp", "name": "ESP elastomers & seal section",
        "baseline": "Nitrile seal section",
        "specs": {
            "sweet":    "NBR seal section",
            "low":      "HNBR seal section",
            "moderate": "HNBR + Aflas bag",
            "high":     "Aflas seal section",
            "extreme":  "FFKM seal section",
        },
        "mechanism": {"sweet": "none", "low": "swell", "moderate": "H2S attack",
                      "high": "H2S attack", "extreme": "H2S + thermal"},
        "risk":  {"sweet": 7, "low": 41, "moderate": 63, "high": 81, "extreme": 93},
        "capex": {"sweet": 0.0, "low": 0.05, "moderate": 0.12, "high": 0.28, "extreme": 0.55},
        "lead":  {"sweet": 0, "low": 2, "moderate": 5, "high": 8, "extreme": 13},
    },
    # ── Surface / flowlines ──────────────────────────────────────────────────
    {
        "id": "flowlines", "group": "surface", "name": "Flowlines & gathering",
        "baseline": "API 5L carbon steel, no allowance",
        "specs": {
            "sweet":    "API 5L carbon steel",
            "low":      "Carbon steel + inhibitor program",
            "moderate": "HIC-resistant plate + 3mm CA",
            "high":     "CRA-clad (316L) line pipe",
            "extreme":  "Solid 2205 duplex line pipe",
        },
        "mechanism": {"sweet": "none", "low": "wt. loss", "moderate": "HIC + wt. loss",
                      "high": "HIC + wt. loss", "extreme": "HIC + wt. loss"},
        "risk":  {"sweet": 5, "low": 42, "moderate": 64, "high": 82, "extreme": 94},
        "capex": {"sweet": 0.0, "low": 0.12, "moderate": 0.5, "high": 1.3, "extreme": 2.8},
        "lead":  {"sweet": 0, "low": 2, "moderate": 6, "high": 12, "extreme": 20},
    },
    {
        "id": "valves_bop", "group": "surface", "name": "Valves & BOP stack",
        "baseline": "Standard-trim gate valves / BOP",
        "specs": {
            "sweet":    "Standard trim",
            "low":      "NACE-trim gate valves",
            "moderate": "H2S-rated BOP + NACE valves",
            "high":     "H2S-rated BOP, CRA-trim valves",
            "extreme":  "Full CRA sour BOP & valve suite",
        },
        "mechanism": {"sweet": "none", "low": "SSC", "moderate": "SSC",
                      "high": "SSC + HIC", "extreme": "SSC + HIC"},
        "risk":  {"sweet": 4, "low": 39, "moderate": 61, "high": 79, "extreme": 91},
        "capex": {"sweet": 0.0, "low": 0.18, "moderate": 0.6, "high": 1.2, "extreme": 2.4},
        "lead":  {"sweet": 0, "low": 3, "moderate": 7, "high": 12, "extreme": 20},
    },
    {
        "id": "inhibitor", "group": "surface", "name": "Corrosion inhibitor & monitoring",
        "baseline": "None",
        "specs": {
            "sweet":    "Not required",
            "low":      "Batch inhibitor + coupons",
            "moderate": "Continuous inhibitor + ER probes",
            "high":     "Continuous inhibitor + online ER/LPR",
            "extreme":  "Continuous inhibitor + inline inspection",
        },
        "mechanism": {"sweet": "none", "low": "wt. loss", "moderate": "wt. loss",
                      "high": "wt. loss", "extreme": "wt. loss"},
        "risk":  {"sweet": 2, "low": 30, "moderate": 48, "high": 66, "extreme": 80},
        "capex": {"sweet": 0.0, "low": 0.04, "moderate": 0.1, "high": 0.22, "extreme": 0.45},
        "lead":  {"sweet": 0, "low": 1, "moderate": 2, "high": 4, "extreme": 6},
    },
]

GROUP_LABELS = {
    "downhole": "Downhole / completion",
    "esp":      "ESP / artificial lift",
    "surface":  "Surface / flowlines",
}

# Baseline expected ESP run-life (months) in sweet service, and the fractional
# derate per band if the sour-rated ESP upgrade is NOT applied. Drives the
# "does it degrade / do I need specific types" answer for artificial lift.
_ESP_BASE_RUNLIFE_MO = 48
_ESP_RUNLIFE_DERATE = {"sweet": 0.0, "low": 0.15, "moderate": 0.35, "high": 0.55, "extreme": 0.75}


def assess_well(well_id: str, h2s: dict | None) -> dict:
    """Full equipment-integrity assessment for one well from its H2S profile.

    Returns a structured dict the Supervisor, tab, and Genie fn all render:
      severity, per-component rows (spec/mechanism/risk/capex/lead), the
      total sour-service capex premium, the critical-path lead time, and the
      ESP run-life impact. Safe on a missing profile (treats as sweet)."""
    h2s = h2s or {}
    sev = severity_for(h2s.get("h2s_ppm_last_measured"), h2s.get("sour_classified"))
    band = sev["band"]

    components = []
    total_capex = 0.0
    max_lead = 0
    critical = None
    for c in COMPONENTS:
        spec = c["specs"][band]
        risk = c["risk"][band]
        capex = c["capex"][band]
        lead = c["lead"][band]
        mech = c["mechanism"][band]
        total_capex += capex
        if lead > max_lead:
            max_lead, critical = lead, c["name"]
        components.append({
            "id": c["id"], "group": c["group"], "group_label": GROUP_LABELS[c["group"]],
            "name": c["name"], "baseline": c["baseline"],
            "required_spec": spec, "mechanism": mech,
            "risk": risk, "risk_tone": _risk_tone(risk),
            "capex_musd": round(capex, 3), "lead_weeks": lead,
            "upgrade_required": band != "sweet" and capex > 0,
        })

    # ESP run-life impact (artificial-lift story).
    derate = _ESP_RUNLIFE_DERATE[band]
    esp_runlife_upgraded = _ESP_BASE_RUNLIFE_MO
    esp_runlife_baseline = round(_ESP_BASE_RUNLIFE_MO * (1 - derate))
    esp_runlife_lost = esp_runlife_upgraded - esp_runlife_baseline

    upgrades = [c for c in components if c["upgrade_required"]]
    return {
        "well_id": well_id,
        "well_name": h2s.get("well_name") or well_id,
        "basin": h2s.get("basin"),
        "severity": sev,
        "sour_classified": bool(h2s.get("sour_classified")),
        "nace_required": bool(h2s.get("nace_mr0175_required")) or band in ("moderate", "high", "extreme"),
        "components": components,
        "upgrade_count": len(upgrades),
        "total_capex_musd": round(total_capex, 2),
        "critical_path_weeks": max_lead,
        "critical_path_item": critical,
        "esp_runlife": {
            "baseline_months": esp_runlife_baseline,
            "upgraded_months": esp_runlife_upgraded,
            "months_lost_if_not_upgraded": esp_runlife_lost,
            "derate_pct": round(derate * 100),
        },
        "summary": _summary_line(sev, len(upgrades), total_capex, max_lead, critical),
    }


def _risk_tone(risk: int) -> str:
    if risk >= 80:
        return "red"
    if risk >= 55:
        return "amber"
    if risk >= 30:
        return "gold"
    return "green"


def _summary_line(sev: dict, n_up: int, capex: float, lead: int, critical: str | None) -> str:
    if sev["band"] == "sweet":
        return "Sweet service — standard metallurgy adequate; no sour-service upgrades required."
    return (
        f"{sev['label']} ({sev['ppm']:g} ppm H2S): {n_up} components require sour-service upgrade "
        f"(NACE MR0175). Added capex ≈ ${capex:.2f}M, critical-path lead time {lead} wk"
        + (f" on {critical}." if critical else ".")
    )


def specialist_text(assessment: dict) -> str:
    """Compact multi-line block for the Supervisor's Equipment Integrity gate."""
    sev = assessment["severity"]
    if sev["band"] == "sweet":
        return (
            f"Sweet service — H2S {sev['ppm']:g} ppm. Standard oilfield metallurgy is adequate; "
            f"no sour-service equipment upgrades or NACE MR0175 compliance triggered."
        )
    lines = [
        f"⚙ EQUIPMENT INTEGRITY — {sev['label']} · H2S {sev['ppm']:g} ppm · "
        f"NACE MR0175 {'required' if assessment['nace_required'] else 'review'}",
        f"{assessment['upgrade_count']} components need sour-service upgrade · "
        f"added capex ≈ ${assessment['total_capex_musd']:.2f}M · "
        f"critical-path lead {assessment['critical_path_weeks']} wk"
        + (f" ({assessment['critical_path_item']})" if assessment['critical_path_item'] else ""),
    ]
    # Name the highest-risk components so the recommendation can cite them.
    top = sorted([c for c in assessment["components"] if c["upgrade_required"]],
                 key=lambda c: c["risk"], reverse=True)[:4]
    for c in top:
        lines.append(
            f"• {c['name']}: {c['baseline']} → {c['required_spec']} "
            f"({c['mechanism']} risk {c['risk']}/100, +${c['capex_musd']:.2f}M, +{c['lead_weeks']}wk)"
        )
    esp = assessment["esp_runlife"]
    if esp["months_lost_if_not_upgraded"] > 0:
        lines.append(
            f"• ESP run-life: {esp['upgraded_months']} mo with sour upgrade vs "
            f"{esp['baseline_months']} mo without ({esp['derate_pct']}% derate) — "
            f"artificial-lift metallurgy upgrade pays for itself in avoided workovers."
        )
    return "\n".join(lines)
