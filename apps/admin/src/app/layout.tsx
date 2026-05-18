import './globals.css'
import type { Metadata } from 'next'
import { QueryProvider } from '@/components/providers/QueryProvider'
import { Toaster } from '@/components/providers/Toaster'

export const metadata: Metadata = {
  title: 'iLaunchify — Admin',
  description: 'Internal admin panel.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-50 text-zinc-900 antialiased">
        <QueryProvider>
          {children}
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  )
}
