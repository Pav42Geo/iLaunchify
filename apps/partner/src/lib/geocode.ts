// US address geocoding — Facility Model Phase 3 substrate (Pavel 2026-07-12).
//
// Uses the US Census Bureau geocoder: free, keyless, US-only — which matches
// the V1 US-only market. Fail-soft by design: geocoding is a routing-quality
// enhancement, never a save blocker. Callers treat null as "no coordinates".
//
// Server-only (network fetch). When non-US markets activate, swap in a keyed
// provider behind this same signature.

export interface GeocodeResult {
  lat: number
  lng: number
}

export async function geocodeUsAddress(input: {
  addressLine1: string
  city: string
  region: string
  postalCode: string
  country?: string | null
}): Promise<GeocodeResult | null> {
  if ((input.country ?? 'US') !== 'US') return null // Census geocoder is US-only
  const oneLine = `${input.addressLine1}, ${input.city}, ${input.region} ${input.postalCode}`
  const url =
    'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?' +
    new URLSearchParams({
      address: oneLine,
      benchmark: 'Public_AR_Current',
      format: 'json',
    }).toString()

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const body = (await res.json()) as {
      result?: { addressMatches?: { coordinates?: { x?: number; y?: number } }[] }
    }
    const coords = body.result?.addressMatches?.[0]?.coordinates
    if (typeof coords?.y !== 'number' || typeof coords?.x !== 'number') return null
    return { lat: coords.y, lng: coords.x }
  } catch {
    return null // network/timeout → no coordinates, never an error
  }
}
