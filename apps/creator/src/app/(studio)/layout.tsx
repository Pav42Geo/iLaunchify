// Design Studio route group layout (REBUILD R1.3 fix).
//
// The studio is full-screen and brings its own 73px CanvasLayoutShell
// header (Saved indicator / undo+redo / COMPLIANCE / PREVIEW / EXPORT /
// Next button). Wrapping it in the dashboard sidebar + AppHeader chrome
// breaks that layout, so the studio lives in its own route group with
// only the auth guard.
//
// Auth is enforced here so direct hits to /products/[id]/design/canvas
// still redirect to /login when signed-out (the previous (dashboard)
// layout did this via requireRole; we mirror it).

import { requireRole } from '@ilaunchify/auth'

export default async function StudioLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireRole(['CREATOR', 'ADMIN'])
  return <>{children}</>
}
