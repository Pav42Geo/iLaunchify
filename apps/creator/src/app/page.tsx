import { redirect } from 'next/navigation'

// Top-level route on app.ilaunchify.com — send signed-in users to dashboard,
// everyone else to the login page.
export default function RootPage() {
  redirect('/dashboard')
}
