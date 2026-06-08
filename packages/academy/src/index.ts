// =============================================================================
// @ilaunchify/academy — content service for the two iLaunchify Academies.
// =============================================================================
//
// Shared by the marketing app (public Creator + Partner academy trees) and the
// admin CMS. Mirrors packages/marketplace: pure routing/render helpers + a
// status FSM + server-side read queries over the @ilaunchify/db client.
//
// Spec: docs/ACADEMY_SPEC.md (§6 routes, §8 CMS, §10 service, §11 search).

// Routing / link builders (pure — RSC + client safe)
export {
  academyBasePath,
  academyHomeHref,
  topicHref,
  courseHref,
  lessonHref,
  updatesHref,
  searchHref,
  isReservedAcademySlug,
  RESERVED_ACADEMY_SLUGS,
} from './routing'
export type { AcademyAudience } from './routing'

// Status FSM (the only path that writes status + audit)
export {
  transitionAcademyStatus,
  canTransitionAcademyStatus,
} from './fsm'
export type { AcademyEntity, TransitionResult } from './fsm'

// Public read queries (server-side)
export {
  getPublishedCourses,
  getTopics,
  getCourseBySlug,
  getLessonBySlug,
  getUpdatesFeed,
  getFeatured,
  searchAcademy,
} from './queries'
export type { CourseListFilters } from './queries'

// Render / SEO helpers (pure)
export {
  courseStructuredData,
  videoStructuredData,
  isoDuration,
  formatDuration,
  estimateCourseMinutes,
} from './render'
export type {
  CourseStructuredDataInput,
  VideoStructuredDataInput,
} from './render'
