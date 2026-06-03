// Admin — create a new PackagingSymbol (C7).

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PackagingSymbolForm } from '../PackagingSymbolForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'New packaging symbol — Admin' }

export default function NewPackagingSymbolPage() {
  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/assets/packaging-symbols"
          className="mb-2 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to packaging symbols
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">New packaging symbol</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Add the symbol, then upload approved artwork variants on the next screen.
        </p>
      </header>
      <PackagingSymbolForm />
    </div>
  )
}
