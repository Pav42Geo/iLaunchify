import { AcademyHomePage } from '@/components/academy/pages'
import { homeMetadata } from '@/components/academy/metadata'

export const dynamic = 'force-dynamic'
export const metadata = homeMetadata('PARTNER')

export default async function Page() {
  return AcademyHomePage({ audience: "PARTNER" })
}
