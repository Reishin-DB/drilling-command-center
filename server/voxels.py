"""Voxel property model built from the well logs.

For one area of interest (every well in the anchor well's basin) this builds a
geocellular model the way a geomodeller would, at demo scale:

1. Structure. A layer-cake framework from the formation tops: one regional
   dip, a gentle four-way closure, and a normal fault, then every zone top is
   corrected so it honours the picks at each well (inverse-distance residuals).
2. Petrophysics at the wells. Vcl from gamma ray, density porosity, effective
   porosity, and Archie Sw, computed from the corrected curves where they exist
   and the raw curves otherwise. Each zone is split into stratigraphic
   sub-layers so a well contributes a vertical profile, not one average.
3. Properties between wells. Simple kriging (exponential covariance) of each
   sub-layer from the control wells, plus a spatially correlated residual
   scaled by the kriging standard deviation, so the model is honest about
   what it does not know: far from control it reverts to the zone mean with
   zone-scale variability, and the uncertainty attribute rises.

The output is a regular voxel grid (zone, porosity, Sw, Vcl, uncertainty)
plus the well paths, the fault, and the hydrocarbon pore-thickness sweet spot
away from existing wells.
"""
import math
import zlib

import numpy as np

from server.db import db

NX = NY = 32
NZ = 48
Z_TOP, Z_BASE = 5000.0, 10000.0          # depth window covered by the logs, ft
SUBLAYERS = 6                            # stratigraphic bins per zone
RANGE_FT = 12000.0                       # kriging correlation range
FWL_BELOW_FT = 60.0                      # free-water level below the deepest logged reservoir base
SWIRR = 0.08                             # irreducible water saturation
AOI_RADIUS_FT = 42_000.0                 # ~8 miles: wells beyond this are a different field
FT_PER_DEG = 364_000.0

# Pay cut-offs used for the sweet-spot map.
PAY = {"phi": 0.08, "sw": 0.50, "vcl": 0.40}

_CACHE: dict[str, dict] = {}


def _seed(*parts: str) -> int:
    return zlib.crc32("|".join(parts).encode())


def _petro(row: dict) -> tuple[float | None, float | None, float | None]:
    """Vcl, effective porosity, Sw for one depth sample."""
    if row.get("phi_eff") is not None and row.get("sw") is not None and row.get("vcl") is not None:
        return row["vcl"], row["phi_eff"], row["sw"]
    gr = row.get("gr_c") if row.get("gr_c") is not None else row.get("gr_raw")
    rhob = row.get("rhob_c") if row.get("rhob_c") is not None else row.get("rhob_raw")
    rt = row.get("rt_c") if row.get("rt_c") is not None else row.get("rt_raw")
    qc_bad = any((row.get(k) or 0) in (1, 2) for k in ("gr_qc", "rhob_qc", "rt_qc"))
    if gr is None or rhob is None or rt is None or qc_bad:
        return None, None, None
    vcl = min(1.0, max(0.0, (gr - 20.0) / 100.0))
    phi_t = min(0.5, max(0.0, (2.65 - rhob) / 1.65))
    phi_e = max(0.0, phi_t * (1.0 - vcl))
    sw = 1.0 if phi_e <= 0.02 or rt <= 0 else min(1.0, max(0.0, math.sqrt(0.05 / (phi_e ** 2 * rt))))
    return vcl, phi_e, sw


def _shf(h):
    """Saturation-height function: Sw vs height above free water (ft). Water
    below the FWL, a transition zone, then approaching irreducible."""
    h = np.asarray(h, dtype=float)
    return np.where(h <= 0, 1.0, SWIRR + (1 - SWIRR) * (1 + np.maximum(h, 0) / 60.0) ** -1.1)


def _noise(rng: np.random.Generator, x, y, s, k: int = 6):
    """Smooth zero-mean, unit-variance random field from random-phase plane waves."""
    out = np.zeros(np.broadcast(x, y, s).shape)
    for _ in range(k):
        lam = rng.uniform(2500, 7000)
        th = rng.uniform(0, 2 * math.pi)
        kv = rng.uniform(0.6, 2.2)  # cycles across the zone thickness
        ph = rng.uniform(0, 2 * math.pi)
        out += np.cos(2 * math.pi * (x * math.cos(th) + y * math.sin(th)) / lam + 2 * math.pi * kv * s + ph)
    return out * math.sqrt(2.0 / k)


def _sk_weights(wx: np.ndarray, wy: np.ndarray, gx: np.ndarray, gy: np.ndarray):
    """Simple-kriging weights and normalised std for every grid column."""
    cov = lambda h: np.exp(-3.0 * (h / RANGE_FT) ** 1.5)   # stable model: smoother than exponential
    if len(wx) == 0:  # no control: pure prior
        return np.zeros((gx.size, 0)), np.ones(gx.size)
    d_ww = np.hypot(wx[:, None] - wx[None, :], wy[:, None] - wy[None, :])
    C = cov(d_ww) + np.eye(len(wx)) * 1e-6
    d_gw = np.hypot(gx.ravel()[:, None] - wx[None, :], gy.ravel()[:, None] - wy[None, :])
    c0 = cov(d_gw)
    w = np.linalg.solve(C, c0.T).T
    var = np.clip(1.0 - np.sum(w * c0, axis=1), 0.0, 1.0)
    return w, np.sqrt(var)


def _trajectory(well_type: str, wid: str, land_ft: float) -> list[list[float]]:
    """Well path as [dx_ft, dy_ft, depth_ft] from the wellhead. Deviated and
    horizontal wells land in the main reservoir so they read correctly in 3D."""
    if well_type not in ("horizontal", "deviated"):
        return [[0.0, 0.0, d] for d in np.linspace(0, Z_BASE, 12).tolist()]
    az = (_seed(wid) % 360) * math.pi / 180
    kop = land_ft - (1400 if well_type == "horizontal" else 2600)
    lateral = 5200 if well_type == "horizontal" else 1800
    pts = [[0.0, 0.0, d] for d in np.linspace(0, kop, 8).tolist()]
    for t in np.linspace(0, 1, 14)[1:]:
        ang = t * (math.pi / 2 if well_type == "horizontal" else math.pi / 4)
        r = land_ft - kop
        disp = r * (1 - math.cos(ang))
        dep = kop + r * math.sin(ang)
        pts.append([disp * math.cos(az), disp * math.sin(az), min(dep, land_ft)])
    last = pts[-1]
    for t in np.linspace(0, 1, 8)[1:]:
        dx = last[0] + lateral * t * math.cos(az)
        dy = last[1] + lateral * t * math.sin(az)
        pts.append([dx, dy, last[2] + (0 if well_type == "horizontal" else lateral * t * 0.9)])
    return [[round(a, 1), round(b, 1), round(c, 1)] for a, b, c in pts]


async def build_model(anchor_well: str) -> dict:
    wells = await db.fetch(
        "SELECT well_id, well_name, basin, field_name, lat, lon, well_type, status, total_depth_ft FROM las.wells ORDER BY well_id"
    )
    anchor = next((w for w in wells if w["well_id"] == anchor_well), wells[0] if wells else None)
    if not anchor:
        return {"error": "no wells"}
    basin = anchor["basin"]

    # Area of interest: wells in the anchor's basin within AOI_RADIUS_FT of it.
    def dist_ft(a, b):
        return math.hypot((a["lon"] - b["lon"]) * math.cos(math.radians(a["lat"])), a["lat"] - b["lat"]) * FT_PER_DEG
    aoi = [w for w in wells if w["basin"] == basin and w.get("lat") is not None and dist_ft(anchor, w) <= AOI_RADIUS_FT]
    key = ",".join(sorted(w["well_id"] for w in aoi))
    if key in _CACHE:
        return _CACHE[key]
    lat0 = sum(w["lat"] for w in aoi) / len(aoi)
    lon0 = sum(w["lon"] for w in aoi) / len(aoi)
    coslat = math.cos(math.radians(lat0))
    for w in aoi:
        w["x"] = (w["lon"] - lon0) * coslat * FT_PER_DEG
        w["y"] = (w["lat"] - lat0) * FT_PER_DEG
    spread = max([math.hypot(w["x"], w["y"]) for w in aoi] + [0.0])
    half = max(7000.0, spread + 5000.0)

    ids = [w["well_id"] for w in aoi]
    tops = await db.fetch(
        "SELECT well_id, formation_name, top_md, base_md, zone_type FROM las.formation_tops "
        "WHERE well_id IN (" + ",".join(f"${i+1}" for i in range(len(ids))) + ") ORDER BY top_md",
        *ids,
    )
    logs = await db.fetch(
        "SELECT well_id, md, gr_raw, rt_raw, rhob_raw, gr_qc, rt_qc, rhob_qc, gr_c, rt_c, rhob_c, vcl, phi_eff, sw "
        "FROM las.depth_logs WHERE well_id IN (" + ",".join(f"${i+1}" for i in range(len(ids))) + ") ORDER BY well_id, md",
        *ids,
    )

    # Zone list in stratigraphic order with the mean picks across the AOI.
    zones: list[dict] = []
    for t in tops:
        z = next((z for z in zones if z["name"] == t["formation_name"]), None)
        if not z:
            z = {"name": t["formation_name"], "type": t["zone_type"], "picks": {}}
            zones.append(z)
        z["picks"][t["well_id"]] = (float(t["top_md"]), float(t["base_md"]))
    if not zones:
        return {"error": f"No formation tops for {anchor['well_id']}: the voxel model needs logged wells (OSDU analog wells carry no logs here)."}
    zones.sort(key=lambda z: np.mean([p[0] for p in z["picks"].values()]))
    for z in zones:
        z["top"] = float(np.mean([p[0] for p in z["picks"].values()]))
        z["base"] = float(np.mean([p[1] for p in z["picks"].values()]))

    # 1. Structural framework.
    rng = np.random.default_rng(_seed(basin, "structure"))
    dip_az = rng.uniform(0, 2 * math.pi)
    dip_ft_per_ft = math.tan(math.radians(rng.uniform(1.0, 2.2)))
    dome_amp = rng.uniform(140, 260)
    dome_x, dome_y = rng.uniform(-0.3, 0.3) * half, rng.uniform(-0.3, 0.3) * half
    fault_az = dip_az + math.pi / 2 + rng.uniform(-0.3, 0.3)
    fault_off = rng.uniform(0.25, 0.45) * half
    fault_throw = rng.uniform(110, 190)
    fn = (math.cos(fault_az + math.pi / 2), math.sin(fault_az + math.pi / 2))  # fault normal

    def deform(x, y):
        dip = dip_ft_per_ft * (x * math.cos(dip_az) + y * math.sin(dip_az))
        dome = -dome_amp * np.exp(-((x - dome_x) ** 2 + (y - dome_y) ** 2) / (2 * (0.55 * half) ** 2))
        side = (x * fn[0] + y * fn[1]) > fault_off
        return dip + dome + np.where(side, fault_throw, 0.0)

    xs = np.linspace(-half, half, NX + 1)
    xc = 0.5 * (xs[:-1] + xs[1:])
    gx, gy = np.meshgrid(xc, xc, indexing="ij")
    D = deform(gx, gy)

    wx = np.array([w["x"] for w in aoi])
    wy = np.array([w["y"] for w in aoi])
    d_gw = np.hypot(gx.ravel()[:, None] - wx[None, :], gy.ravel()[:, None] - wy[None, :])
    idw = 1.0 / np.maximum(d_gw, 300.0) ** 2
    idw /= idw.sum(axis=1, keepdims=True)
    for z in zones:
        res = []
        for w in aoi:
            pk = z["picks"].get(w["well_id"])
            res.append(0.0 if not pk else pk[0] - (z["top"] + float(deform(np.array(w["x"]), np.array(w["y"])))))
        corr = (idw @ np.array(res)).reshape(gx.shape)
        thick = z["base"] - z["top"]
        z["top_grid"] = z["top"] + D + corr
        z["base_grid"] = z["top_grid"] + thick

    # 2. Petrophysical profiles at the control wells.
    by_well: dict[str, list[dict]] = {}
    for r in logs:
        by_well.setdefault(r["well_id"], []).append(r)
    stats = {}
    for zi, z in enumerate(zones):
        prof = {}  # well_id -> array (SUBLAYERS, 3) of vcl/phi/sw, nan where empty
        allv = []
        for w in aoi:
            pk = z["picks"].get(w["well_id"])
            rows = by_well.get(w["well_id"], [])
            if not pk or not rows:
                continue
            acc = [[] for _ in range(SUBLAYERS)]
            for r in rows:
                if pk[0] <= r["md"] < pk[1]:
                    v = _petro(r)
                    if v[0] is None:
                        continue
                    b = min(SUBLAYERS - 1, int((r["md"] - pk[0]) / (pk[1] - pk[0]) * SUBLAYERS))
                    acc[b].append(v)
                    allv.append(v)
            arr = np.array([np.mean(a, axis=0) if a else [np.nan] * 3 for a in acc])
            if np.isfinite(arr).any():
                prof[w["well_id"]] = arr
        allv = np.array(allv) if allv else np.array([[0.5, 0.05, 0.9]])
        stats[zi] = {"mean": allv.mean(axis=0), "std": np.maximum(allv.std(axis=0), [0.04, 0.012, 0.05]), "prof": prof}

    # 3. Fill the grid: zone lookup per column, kriging per sub-layer.
    zc = Z_TOP + (np.arange(NZ) + 0.5) * (Z_BASE - Z_TOP) / NZ
    # Free-water level just below the deepest reservoir base seen at a control
    # well, so every well's logged Sw stays above it (the logs show no contact).
    res_zone = next((z for z in zones if z["type"] == "reservoir"), None)
    fwl = (max(p[1] for p in res_zone["picks"].values()) + FWL_BELOW_FT) if res_zone else Z_BASE + 1e4
    zone = np.full((NX, NY, NZ), -1, dtype=int)
    vcl = np.zeros((NX, NY, NZ)); phi = np.zeros_like(vcl); sw = np.ones_like(vcl); unc = np.ones_like(vcl)
    vcl_k = np.zeros_like(vcl); phi_k = np.zeros_like(vcl); sw_k = np.ones_like(vcl)   # kriged estimate, no residual
    for zi, z in enumerate(zones):
        st = stats[zi]
        cw = [w for w in aoi if w["well_id"] in st["prof"]]
        W, sd = _sk_weights(np.array([w["x"] for w in cw]), np.array([w["y"] for w in cw]), gx, gy)
        W = W.reshape(NX, NY, -1); sd = sd.reshape(NX, NY)
        nrng = np.random.default_rng(_seed(basin, z["name"]))
        tg, bg = z["top_grid"][..., None], z["base_grid"][..., None]
        inside = (zc[None, None, :] >= tg) & (zc[None, None, :] < bg)
        s = np.clip((zc[None, None, :] - tg) / (bg - tg), 0, 0.999)
        b = (s * SUBLAYERS).astype(int)
        n_phi = _noise(nrng, gx[..., None], gy[..., None], s)
        n_vcl = 0.5 * -n_phi + 0.85 * _noise(nrng, gx[..., None], gy[..., None], s)
        n_sw = -0.6 * n_phi + 0.8 * _noise(nrng, gx[..., None], gy[..., None], s)
        noises = [n_vcl, n_phi, n_sw]
        shf_zone = z["type"] == "reservoir"
        for p in range(3):
            # In the main reservoir, Sw follows a saturation-height function
            # above the free-water level; the wells set the multiplier.
            use_shf = p == 2 and shf_zone
            def well_val(w, bi):
                v = st["prof"][w["well_id"]][bi, p]
                if use_shf and np.isfinite(v):
                    pk = z["picks"][w["well_id"]]
                    v = v / _shf(fwl - (pk[0] + (bi + 0.5) / SUBLAYERS * (pk[1] - pk[0])))
                return v
            vals_all = [[well_val(w, bi) for w in cw] for bi in range(SUBLAYERS)]
            flat = [v for row in vals_all for v in row if np.isfinite(v)]
            m = float(np.mean(flat)) if flat else st["mean"][p]
            krig = np.full((NX, NY, NZ), m)
            for bi in range(SUBLAYERS):
                vals = np.array(vals_all[bi]) if cw else np.array([])
                vals = np.where(np.isfinite(vals), vals, m)
                est = m + (W @ (vals - m) if len(vals) else 0.0)
                krig = np.where(b == bi, est[..., None] if np.ndim(est) == 2 else est, krig)
            if use_shf:
                krig = krig * _shf(fwl - zc[None, None, :])
            val = krig + sd[..., None] * st["std"][p] * noises[p]
            (vcl, phi, sw)[p][inside] = val[inside]
            (vcl_k, phi_k, sw_k)[p][inside] = krig[inside]
        zone[inside] = zi
        unc[inside] = np.broadcast_to(sd[..., None], inside.shape)[inside]
    vcl = np.clip(vcl, 0, 1); phi = np.clip(phi, 0, 0.35); sw = np.clip(sw, 0.05, 1.0)

    # Hydrocarbon pore thickness (ft) per column over pay cells: the realisation
    # drawn in 3D, and the kriged estimate used to rank locations.
    dz = (Z_BASE - Z_TOP) / NZ
    def hcpt_of(ph, s_, v_):
        p_ = (zone >= 0) & (ph >= PAY["phi"]) & (s_ <= PAY["sw"]) & (v_ <= PAY["vcl"])
        return p_, np.sum(np.where(p_, ph * (1 - s_) * dz, 0.0), axis=2)
    pay, hcpt = hcpt_of(phi, sw, vcl)
    pay_k, hcpt_k = hcpt_of(phi_k, sw_k, vcl_k)
    col_u = np.where(pay_k.any(axis=2), np.sum(np.where(pay_k, unc, 0), axis=2) / np.maximum(pay_k.sum(axis=2), 1), 1.0)
    dmin = d_gw.min(axis=1).reshape(NX, NY)
    # Offset candidates sit 2,500 ft to one correlation range from control:
    # far enough to add new rock, close enough that the logs still inform them.
    # Rank on kriged HCPT haircut by kriging uncertainty.
    risked = hcpt_k * (1.0 - 0.5 * col_u)
    cand = np.where((dmin > 2500) & (dmin < RANGE_FT), risked, -1)
    ci, cj = np.unravel_index(int(np.argmax(cand)), cand.shape)
    well_hcpt = []
    for w in aoi:
        i = int(np.clip(np.searchsorted(xs, w["x"]) - 1, 0, NX - 1)); j = int(np.clip(np.searchsorted(xs, w["y"]) - 1, 0, NY - 1))
        well_hcpt.append({"well_id": w["well_id"], "hcpt_ft": round(float(hcpt_k[i, j]), 1)})
    sweet = {
        "x": float(gx[ci, cj]), "y": float(gy[ci, cj]),
        "lat": round(lat0 + float(gy[ci, cj]) / FT_PER_DEG, 5),
        "lon": round(lon0 + float(gx[ci, cj]) / (FT_PER_DEG * coslat), 5),
        "i": int(ci), "j": int(cj),
        "hcpt_ft": round(float(hcpt_k[ci, cj]), 1),
        "risked_hcpt_ft": round(float(risked[ci, cj]), 1),
        "control_mean_hcpt_ft": round(float(np.mean([w["hcpt_ft"] for w in well_hcpt])), 1),
        "nearest_well_ft": round(float(dmin[ci, cj])),
        "uncertainty": round(float(col_u[ci, cj]), 2),
        "pay_zones": sorted({zones[k]["name"] for k in np.unique(zone[ci, cj][pay_k[ci, cj]]).tolist()}),
    }

    zone_summary = []
    for zi, z in enumerate(zones):
        m = zone == zi
        n = int(m.sum())
        zone_summary.append({
            "name": z["name"], "type": z["type"], "voxels": n,
            "pay_fraction": round(float((pay & m).sum() / n), 3) if n else 0.0,
            "phi_mean": round(float(phi[m].mean()), 3) if n else None,
            "sw_mean": round(float(sw[m].mean()), 3) if n else None,
            "control_wells": len(stats[zi]["prof"]),
        })

    land = next((z for z in zones if z["type"] == "reservoir"), zones[len(zones) // 2])
    land_ft = 0.5 * (land["top"] + land["base"])
    r3 = lambda a: np.round(a.transpose(2, 1, 0).ravel(), 3).tolist()   # x fastest, then y, then z
    model = {
        "basin": basin,
        "field": anchor.get("field_name"),
        "origin": {"lat": lat0, "lon": lon0},
        "grid": {"nx": NX, "ny": NY, "nz": NZ, "x0": -half, "y0": -half, "z0": Z_TOP,
                 "dx": 2 * half / NX, "dy": 2 * half / NY, "dz": dz, "order": "x fastest, then y, then depth"},
        "zones": [{"name": z["name"], "type": z["type"], "top_ft": round(z["top"]), "base_ft": round(z["base"])} for z in zones],
        "zone": zone.transpose(2, 1, 0).ravel().tolist(),
        "phi": r3(phi), "sw": r3(sw), "vcl": r3(vcl), "unc": r3(unc),
        "hcpt": np.round(hcpt_k.T.ravel(), 1).tolist(),
        "wells": [{
            "well_id": w["well_id"], "well_name": w["well_name"], "well_type": w["well_type"], "status": w["status"],
            "x": round(w["x"], 1), "y": round(w["y"], 1),
            "path": [[w["x"] + p[0], w["y"] + p[1], p[2]] for p in _trajectory(w["well_type"] or "vertical", w["well_id"], land_ft)],
            "control": any(w["well_id"] in stats[zi]["prof"] for zi in stats),
            "picks": [{"name": z["name"], "top_ft": z["picks"][w["well_id"]][0]} for z in zones if w["well_id"] in z["picks"]],
        } for w in aoi],
        "fault": {"azimuth_deg": round(math.degrees(fault_az) % 360, 1), "offset_ft": round(fault_off), "throw_ft": round(fault_throw),
                  "normal": [round(fn[0], 4), round(fn[1], 4)]},
        "fwl_ft": round(fwl) if res_zone else None,
        "structure": {"dip_deg": round(math.degrees(math.atan(dip_ft_per_ft)), 2), "dip_azimuth_deg": round(math.degrees(dip_az) % 360, 1),
                      "closure_ft": round(dome_amp)},
        "pay_cutoffs": PAY,
        "sweet_spot": sweet,
        "well_hcpt": well_hcpt,
        "zone_summary": zone_summary,
        "method": "Layer-cake structure honouring well tops (IDW residuals) + simple kriging of log-derived Vcl/phi/Sw per stratigraphic sub-layer, "
                  f"exponential covariance range {int(RANGE_FT)} ft, residual noise scaled by kriging std.",
    }
    _CACHE[key] = model
    return model
