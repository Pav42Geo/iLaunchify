import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'iLaunchify — Design, customize, and launch your brand',
  description:
    'A platform for influencers, culinary creators, and brand launchers. ' +
    'Browse curated production-ready templates, customize the label, and we ' +
    'handle manufacturing, printing, and fulfillment.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Default surface = light (creator marketplace). The /business route
  // overrides at its own layout via `<html data-surface="dark">`.
  return (
    <html lang="en" data-surface="light" data-density="creator">
      <body>{children}</body>
    </html>
  )
}
