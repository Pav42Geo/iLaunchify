import { AcademySearchPage } from '@/components/academy/pages'
import { searchMetadata } from '@/components/academy/metadata'

export const dynamic = 'force-dynamic'
export const metadata = searchMetadata()

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  return AcademySearchPage({ audience: 'PARTNER', q: q ?? '' })
}
