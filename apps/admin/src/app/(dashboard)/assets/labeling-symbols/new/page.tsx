// Admin — create a new LabelingSymbol (C7).

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { LabelingSymbolForm } from '../LabelingSymbolForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'New labeling symbol — Admin' }

export default function NewLabelingSymbolPage() {
  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/assets/labeling-symbols"
          className="mb-2 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to labeling symbols
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">New labeling symbol</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Add the symbol, then upload approved artwork — SVG, PNG, or PDF — as variants on the next screen.
        </p>
      </header>
      <LabelingSymbolForm />
    </div>
  )
}
