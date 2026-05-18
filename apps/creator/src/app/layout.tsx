import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'iLaunchify — Creator Dashboard',
  description: 'Design, comply, ship.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
