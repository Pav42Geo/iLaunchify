import type { ReactNode } from 'react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">iLaunchify</h1>
          <p className="mt-1 text-sm text-zinc-500">Design, comply, ship.</p>
        </div>
        {children}
      </div>
    </div>
  )
}
