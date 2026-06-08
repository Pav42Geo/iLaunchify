import { AcademyCoursePage } from '@/components/academy/pages'
import { courseMetadata } from '@/components/academy/metadata'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ courseSlug: string }> }) {
  const { courseSlug } = await params
  return courseMetadata('CREATOR', courseSlug)
}

export default async function Page({ params }: { params: Promise<{ courseSlug: string }> }) {
  const { courseSlug } = await params
  return AcademyCoursePage({ audience: "CREATOR", courseSlug })
}
