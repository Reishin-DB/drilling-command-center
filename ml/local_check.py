"""
Local sanity check for the synthetic-sonic problem, numpy only (no Spark, no
scikit-learn): is DT recoverable from the other curves on held-out wells, and
by how much more than a one-curve transform?

Uses the same generator as the app and the raw landing job, skips spike and
gap samples, and compares leave-one-well-out:
  gardner_textbook, gardner_calibrated, linear (all curves), quadratic (all curves)
The quadratic least-squares fit is a stand-in for the gradient-boosted model.

    python ml/local_check.py
"""
import inspect
import os
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(inspect.getsourcefile(lambda: 0))))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "pipelines"))

from generate_raw import OFFSETS  # noqa: E402
from server.schema import WELL_LOG_CONFIGS, _get_zone, _ZONES, _gen_log_samples  # noqa: E402

ZIDX = {z[0]: k for k, z in enumerate(_ZONES)}


def samples():
    wells = [(w, s, d, sp) for w, s, d, sp in WELL_LOG_CONFIGS if d] + [(o[0], o[-1], True, True) for o in OFFSETS]
    X, y, g = [], [], []
    for wid, seed, _d, sp in wells:
        for r in _gen_log_samples(wid, 5000.0, 10000.0, seed, has_dt=True, add_spikes=sp, status="raw"):
            if None in (r[2], r[3], r[5], r[6], r[7]) or any(r[11:16]):
                continue
            X.append([r[2], r[5], r[6], np.log10(r[3]), r[1], ZIDX[_get_zone(r[1])[0]]])
            y.append(r[7]); g.append(wid)
    return np.array(X), np.array(y), np.array(g)


def design(X, quad):
    z = np.eye(len(_ZONES))[X[:, 5].astype(int)]
    base = np.column_stack([X[:, :5], z])
    if not quad:
        return base
    c = X[:, :4]
    inter = np.column_stack([c[:, i] * c[:, j] for i in range(4) for j in range(i, 4)])
    return np.column_stack([base, inter])


def main():
    X, y, g = samples()
    print(f"{len(y)} clean samples, {len(set(g))} wells")
    out = {k: [] for k in ("gardner_textbook", "gardner_calibrated", "linear", "quadratic")}
    for well in sorted(set(g)):
        tr, te = g != well, g == well
        out["gardner_textbook"].append(1e6 / (X[te, 1] / 0.23) ** 4 - y[te])
        b, a = np.polyfit(np.log(X[tr, 1]), np.log(y[tr]), 1)
        out["gardner_calibrated"].append(np.exp(a + b * np.log(X[te, 1])) - y[te])
        for k, q in (("linear", False), ("quadratic", True)):
            A = design(X, q)
            coef, *_ = np.linalg.lstsq(A[tr], y[tr], rcond=None)
            out[k].append(A[te] @ coef - y[te])
    var = np.var(y)
    for k, errs in out.items():
        e = np.concatenate(errs)
        print(f"  {k:20s} MAE {np.mean(np.abs(e)):6.2f}  RMSE {np.sqrt(np.mean(e**2)):6.2f}  "
              f"R2 {1 - np.mean(e**2) / var:6.3f} us/ft")


if __name__ == "__main__":
    main()
