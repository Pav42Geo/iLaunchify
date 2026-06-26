// =============================================================================
// Label compliance check (read-only) — runs the die-line frame gate against the
// product's saved design. docs/DIELINE_FRAME_EDITOR_SPEC.md §5.
// =============================================================================

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CheckCircle2, XCircle, ShieldCheck } from 'lucide-react'
import { requireUser } from '@ilaunchify/auth'
import { loadProductLabelCompliance } from '@/lib/dieline-compliance'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Label compliance check' }

interface PageProps {
  params: Promise<{ productId: string }>
}

export default async function LabelCheckPage({ params }: PageProps) {
  const { productId } = await params
  const user = await requireUser()
  const res = await loadProductLabelCompliance(productId, user.id)
  if (!res) notFound()

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link href={`/products/${productId}`} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-pink-700 hover:text-pink-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to product
      </Link>
      <h1 className="mt-3 font-display text-[24px] font-bold tracking-[-0.02em] text-ink-900">Label compliance</h1>
      <p className="mt-1 text-[13px] text-ink-600">
        Checks {res.productName}&rsquo;s saved label design against its die-line&rsquo;s required frames.
      </p>

      {!res.hasDieline || !res.report ? (
        <div className="mt-6 rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-10 text-center text-[13px] text-ink-500">
          <ShieldCheck className="mx-auto mb-2 h-7 w-7 text-ink-300" />
          No active die-line is attached to this product&rsquo;s packaging yet, so there&rsquo;s nothing to check against.
        </div>
      ) : (
        <>
          <div
            className={`mt-5 flex items-center gap-3 rounded-2xl border px-5 py-4 ${
              res.report.status === 'pass'
                ? 'border-success-200 bg-success-50'
                : 'border-danger-200 bg-danger-50'
            }`}
          >
            {res.report.status === 'pass' ? (
              <CheckCircle2 className="h-6 w-6 text-success-600" />
            ) : (
              <XCircle className="h-6 w-6 text-danger-600" />
            )}
            <div>
              <p className={`font-display text-[15px] font-semibold ${res.report.status === 'pass' ? 'text-success-900' : 'text-danger-900'}`}>
                {res.report.status === 'pass' ? 'All required elements present' : `${res.report.failureCount} required element${res.report.failureCount === 1 ? '' : 's'} missing`}
              </p>
              <p className="text-[12px] text-ink-600">{res.frameCount} frames on the die-line · {res.report.checks.length} required</p>
            </div>
          </div>

          <ul className="mt-4 space-y-2">
            {res.report.checks.map((c) => (
              <li
                key={c.frameId}
                className={`flex items-start gap-2.5 rounded-xl border px-4 py-2.5 text-[12.5px] ${
                  c.status === 'pass' ? 'border-ink-100 bg-white' : 'border-danger-200 bg-danger-50/50'
                }`}
              >
                {c.status === 'pass' ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-600" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger-600" />
                )}
                <div>
                  <span className="font-medium text-ink-900">{humanKind(c.kind)}</span>
                  {c.issues.map((iss, i) => (
                    <p key={i} className="text-[11.5px] text-danger-700">{iss.message}</p>
                  ))}
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-[11px] text-ink-400">
            V1 checks presence of each required element. Safe-area placement and recipe-freshness activate once the
            Studio stamps objects (Phase B).
          </p>
        </>
      )}
    </div>
  )
}

function humanKind(k: string): string {
  return k.toLowerCase().split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}
