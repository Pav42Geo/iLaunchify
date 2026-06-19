import { redirect } from 'next/navigation'

// LEGACY product hub removed (2026-06-18). The old 4-step card overview
// (Customize / Design label / Compliance / Order production + Configure / Label
// compliance / Spec sheet + Retail identity) is no longer used — the Design
// Studio is the canonical product work surface (its Next button drives checkout,
// and barcode/GTIN now live in the Studio's Barcode drawer).
//
// Kept as a server redirect so existing links + bookmarks to /products/[id]
// (dashboard "Review", products-list view, orders, subscriptions) forward
// cleanly instead of 404-ing. Auth + not-found are handled by the Studio page.
export default async function ProductOverview({
  params,
}: {
  params: Promise<{ productId: string }>
}) {
  const { productId } = await params
  redirect(`/products/${productId}/design/canvas`)
}
