// Checkout route-group layout (REBUILD R12.a).
//
// Checkout is a focused, full-screen flow — no dashboard sidebar, no
// AppHeader chrome. The wizard brings its own Studio-style top bar with
// the brand + product on the left and the stepper centered. This layout
// only enforces auth so direct hits to /products/[id]/checkout still
// redirect to /login when signed-out.

import { requireRole } from '@ilaunchify/auth'

export default async function CheckoutLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireRole(['CREATOR', 'ADMIN'])
  return <>{children}</>
}
