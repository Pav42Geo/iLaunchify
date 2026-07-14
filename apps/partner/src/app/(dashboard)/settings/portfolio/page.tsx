// Portfolio removed from the partner program (Pavel 2026-07-13) — page, rail
// entry, hub card, and completeness pillar are gone. PartnerPortfolioItem
// model stays (additive-migrations rule); the Front Face portfolio tab hides
// itself when a partner has no items.
import { redirect } from 'next/navigation'

export default function RemovedPortfolioPage() {
  redirect('/settings')
}
