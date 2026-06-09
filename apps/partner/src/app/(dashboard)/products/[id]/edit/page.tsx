// The product editor is now the guided builder (consolidation, 2026-06-08).
// /products/[id]/edit redirects to the builder seeded with the product (load-back
// via ?draft=). EditorShell is retired from routing; its component + cards files
// are kept (their server actions are reused by the builder) until cleanup.

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ProductEditPage({ params }: PageProps) {
  const { id } = await params
  redirect(`/products/new?draft=${id}`)
}
