"""Fetch WTI crude prices. Tries FRED's public CSV first; falls back to a
generated synthetic 3-year series when the app has no egress to fred.stlouisfed.org
(typical default for Databricks Apps)."""
from __future__ import annotations

import csv
import datetime
import io
import math
import random


FRED_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILWTICO"


def _fetch_fred(years_back: int) -> list[tuple[datetime.date, float]]:
    try:
        import httpx
    except Exception:
        return []
    try:
        with httpx.Client(timeout=8.0) as client:
            r = client.get(FRED_URL)
            r.raise_for_status()
            text = r.text
    except Exception as e:
        print(f"FRED WTI fetch failed: {e}")
        return []

    cutoff = datetime.date.today() - datetime.timedelta(days=365 * years_back)
    out: list[tuple[datetime.date, float]] = []
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        try:
            d = datetime.date.fromisoformat(row["DATE"])
        except Exception:
            continue
        if d < cutoff:
            continue
        raw = (row.get("DCOILWTICO") or "").strip()
        if raw in ("", "."):
            continue
        try:
            price = float(raw)
        except ValueError:
            continue
        out.append((d, price))
    out.sort(key=lambda x: x[0])
    return out


def _synthetic_series(years_back: int) -> list[tuple[datetime.date, float]]:
    """Realistic-looking WTI series used when FRED egress is blocked.
    Anchored around a plausible spot near $80 with slow cycles + noise."""
    rng = random.Random(2026)
    start = datetime.date.today() - datetime.timedelta(days=365 * years_back)
    days = (datetime.date.today() - start).days
    base = 78.0
    series: list[tuple[datetime.date, float]] = []
    price = base
    for i in range(days + 1):
        d = start + datetime.timedelta(days=i)
        if d.weekday() >= 5:  # skip weekends
            continue
        cycle = 7 * math.sin(i / 120.0) + 4 * math.sin(i / 35.0)
        noise = rng.gauss(0, 1.2)
        drift = 0.004 * (i - days / 2)  # mild long-run drift
        price = base + cycle + noise + drift
        price = max(35.0, min(140.0, price))
        series.append((d, round(price, 2)))
    return series


def fetch_wti_prices(years_back: int = 3) -> list[tuple[datetime.date, float]]:
    """Return [(date, price_usd), ...] for the last N years."""
    rows = _fetch_fred(years_back)
    if rows:
        print(f"WTI: FRED returned {len(rows)} rows")
        return rows
    rows = _synthetic_series(years_back)
    print(f"WTI: using synthetic fallback ({len(rows)} rows)")
    return rows
