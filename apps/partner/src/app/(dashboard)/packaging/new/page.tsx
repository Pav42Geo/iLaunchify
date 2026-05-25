// New packaging system — minimal create form.
// After save, redirects to /packaging/[id] where the partner manages
// surfaces (die-line uploads, printable area, color modes).

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PackagingForm } from '../PackagingForm'

export const metadata = { title: 'Add packaging — iLaunchify Partners' }

export default function NewPackagingPage() {
  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/packaging"
          className="mb-2 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to catalog
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Add packaging</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Capture the core fields now — you&apos;ll add surfaces (Front, Lid, etc.) on the
          next screen.
        </p>
      </header>

      <PackagingForm mode="create" />
    </div>
  )
}
