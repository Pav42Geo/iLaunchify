/**
 * Phase L2 — carrier gateway core (docs/LOGISTICS_AND_FULFILLMENT.md §6).
 * EasyPost parcel gateway (decision L3) behind the CarrierGateway seam so
 * ShipEngine LTL / broker reefer slot in later without touching callers.
 *
 * Design rules:
 *  - HTTP client is INJECTED (EasyPostHttp) — unit tests use fakes, no network.
 *  - API keys come from env at the call site, never from the DB
 *    (integrations-registry rule). Forge child accounts are referenced by
 *    CarrierAccount.externalRef; their keys live in the secret store.
 *  - All money in integer cents; EasyPost returns dollar strings — converted here.
 */

export interface ShipAddress {
  name: string
  company?: string | null
  phone?: string | null
  street1: string
  street2?: string | null
  city: string
  state?: string | null
  zip: string
  country: string // ISO-2
}

export interface ParcelSpec {
  lengthIn: number
  widthIn: number
  heightIn: number
  weightLb: number
  /** UN1845 — passed to the carrier as dry-ice option when > 0. */
  dryIceGrams?: number
}

export interface RateQuote {
  provider: 'easypost'
  externalShipmentId: string
  externalRateId: string
  carrier: string // "UPS" | "FedEx" | "USPS" (EasyPost naming preserved)
  service: string // "Ground", "2ndDayAir", …
  rateCents: number
  transitDays: number | null
}

export interface PurchasedLabel {
  provider: 'easypost'
  externalShipmentId: string
  trackingNumber: string
  carrier: string
  service: string
  costCents: number
  labelUrl: string
  publicTrackingUrl: string | null
}

/** Minimal HTTP seam. Implement with fetch at the app edge; fake in tests. */
export interface EasyPostHttp {
  request(method: 'GET' | 'POST', path: string, body: unknown, apiKey: string): Promise<unknown>
}

export function dollarsToCents(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number.parseFloat(v)
  if (Number.isNaN(n)) return null
  return Math.round(n * 100)
}

interface EpRate {
  id?: string
  carrier?: string
  service?: string
  rate?: string
  delivery_days?: number | null
}
interface EpShipment {
  id?: string
  rates?: EpRate[]
}

export class EasyPostParcelGateway {
  constructor(
    private readonly http: EasyPostHttp,
    private readonly apiKey: string,
  ) {}

  /** Create a shipment and return normalized rate quotes. */
  async rate(args: {
    from: ShipAddress
    to: ShipAddress
    parcels: ParcelSpec[]
    /** Carrier account ids scoped to this partner's child user (BYO or platform). */
    carrierAccountIds?: string[]
  }): Promise<{ externalShipmentId: string; quotes: RateQuote[] }> {
    // EasyPost models one parcel per shipment; V1 rates the heaviest parcel and
    // multiplies count at the caller when parcels are uniform (checkout quote).
    const parcel = args.parcels[0]
    if (!parcel) throw new Error('rate: at least one parcel required')
    const body = {
      shipment: {
        from_address: toEpAddress(args.from),
        to_address: toEpAddress(args.to),
        parcel: {
          length: parcel.lengthIn,
          width: parcel.widthIn,
          height: parcel.heightIn,
          weight: parcel.weightLb * 16, // EasyPost weight is in OUNCES
        },
        ...(parcel.dryIceGrams && parcel.dryIceGrams > 0
          ? { options: { dry_ice: true, dry_ice_weight: (parcel.dryIceGrams / 453.592).toFixed(2) } }
          : {}),
        ...(args.carrierAccountIds?.length ? { carrier_accounts: args.carrierAccountIds } : {}),
      },
    }
    const res = (await this.http.request('POST', '/v2/shipments', body, this.apiKey)) as EpShipment
    const shipmentId = res.id
    if (!shipmentId) throw new Error('rate: EasyPost returned no shipment id')
    const quotes: RateQuote[] = (res.rates ?? []).flatMap((r) => {
      const rateCents = dollarsToCents(r.rate)
      if (!r.id || !r.carrier || !r.service || rateCents === null) return []
      return [{
        provider: 'easypost' as const,
        externalShipmentId: shipmentId,
        externalRateId: r.id,
        carrier: r.carrier,
        service: r.service,
        rateCents,
        transitDays: r.delivery_days ?? null,
      }]
    })
    return { externalShipmentId: shipmentId, quotes }
  }

  /** Buy a previously quoted rate. */
  async buy(args: { externalShipmentId: string; externalRateId: string }): Promise<PurchasedLabel> {
    const res = (await this.http.request(
      'POST',
      `/v2/shipments/${args.externalShipmentId}/buy`,
      { rate: { id: args.externalRateId } },
      this.apiKey,
    )) as {
      id?: string
      tracking_code?: string
      selected_rate?: EpRate
      postage_label?: { label_url?: string }
      tracker?: { public_url?: string }
    }
    if (!res.id || !res.tracking_code) throw new Error('buy: EasyPost purchase failed')
    const costCents = dollarsToCents(res.selected_rate?.rate) ?? 0
    return {
      provider: 'easypost',
      externalShipmentId: res.id,
      trackingNumber: res.tracking_code,
      carrier: res.selected_rate?.carrier ?? 'unknown',
      service: res.selected_rate?.service ?? 'unknown',
      costCents,
      labelUrl: res.postage_label?.label_url ?? '',
      publicTrackingUrl: res.tracker?.public_url ?? null,
    }
  }

  /** Create a Forge child user (platform-paid partner sub-account). Returns the
   *  child id for CarrierAccount.externalRef; the child API key must be stored
   *  in the secret store by the caller — never in the DB. */
  async createChildUser(name: string): Promise<{ childUserId: string }> {
    const res = (await this.http.request('POST', '/v2/users', { user: { name } }, this.apiKey)) as { id?: string }
    if (!res.id) throw new Error('createChildUser failed')
    return { childUserId: res.id }
  }
}

function toEpAddress(a: ShipAddress) {
  return {
    name: a.name,
    company: a.company ?? undefined,
    phone: a.phone ?? undefined,
    street1: a.street1,
    street2: a.street2 ?? undefined,
    city: a.city,
    state: a.state ?? undefined,
    zip: a.zip,
    country: a.country,
  }
}
