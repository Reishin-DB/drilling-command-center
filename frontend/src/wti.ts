// Honest label for where the WTI series came from (server/prices.py SOURCE).
export function wtiSourceLabel(src?: string): string {
  if (src === 'fred_marketplace') return 'FRED via Marketplace share'
  if (src === 'fred_csv') return 'FRED DCOILWTICO'
  if (src === 'synthetic') return 'synthetic series (no FRED egress)'
  return 'FRED, or synthetic if egress is blocked'
}
