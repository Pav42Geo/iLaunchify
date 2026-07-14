// Prepress output page retired (IA reorg, Pavel 2026-07-14) — the per-service
// PartnerPrintOutputSpec editor now lives inside each service's accordion on
// /services ("Prepress delivery" section, rendered by PrepressSection.tsx in
// this directory; PrintSpecForm + save action unchanged).
import { redirect } from 'next/navigation'

export default function MovedPrintSpecPage() {
  redirect('/services')
}
