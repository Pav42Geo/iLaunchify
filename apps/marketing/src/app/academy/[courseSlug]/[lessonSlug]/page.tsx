import { AcademyLessonPage } from '@/components/academy/pages'
import { lessonMetadata } from '@/components/academy/metadata'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ courseSlug: string; lessonSlug: string }> }) {
  const { courseSlug, lessonSlug } = await params
  return lessonMetadata('CREATOR', courseSlug, lessonSlug)
}

export default async function Page({ params }: { params: Promise<{ courseSlug: string; lessonSlug: string }> }) {
  const { courseSlug, lessonSlug } = await params
  return AcademyLessonPage({ audience: "CREATOR", courseSlug, lessonSlug })
}
