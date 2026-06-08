import { AcademyTopicPage } from '@/components/academy/pages'
import { topicMetadata } from '@/components/academy/metadata'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ topicSlug: string }> }) {
  const { topicSlug } = await params
  return topicMetadata('PARTNER', topicSlug)
}

export default async function Page({ params }: { params: Promise<{ topicSlug: string }> }) {
  const { topicSlug } = await params
  return AcademyTopicPage({ audience: "PARTNER", topicSlug })
}
