// Product defaults page retired (Pavel 2026-07-13) — the editor lives on
// /services (#product-defaults accordion) with the other operating facts.
// actions.ts + ProductDefaultsForm.tsx in this directory stay: the /services
// card and the products/new prefill (build-actions) import them.
import { redirect } from 'next/navigation'

export default function MovedProductDefaultsPage() {
  redirect('/services?sec=defaults')
}
