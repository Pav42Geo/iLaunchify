'use client'

// Certificates editor card — attach VERIFIED PartnerCertificateInstance rows.
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §4.3 (⑥) + #132.
//
// Only VERIFIED certs surface in the picker — partner has to wait through
// admin review on /admin/certificate-types before claims become attachable.
// Per-size scope (appliesToPackagingSystemIds) defaults to ALL sizes; the
// per-size scope picker is V1.1.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@ilaunchify/ui'
import { toast } from 'sonner'
import { Award, Plus, Trash2, Clock, AlertTriangle, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { attachCertificate, detachCertificate } from '../card-actions'

export interface AttachedCertRow {
  instanceId: string
  certName: string
  expiryDate: Date
  certificateNumber: string | null
}

export interface AvailableCertOption {
  id: string
  certName: string
  certificateNumber: string | null
  expiryDate: Date
  status: 'PENDING_REVIEW' | 'VERIFIED' | 'EXPIRED' | 'REJECTED'
}

interface CertificatesCardProps {
  productTemplateId: string
  attached: AttachedCertRow[]
  availableInstances: AvailableCertOption[]
  isDraft: boolean
}

export function CertificatesCard({
  productTemplateId,
  attached,
  availableInstances,
  isDraft,
}: CertificatesCardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const attachedIds = new Set(attached.map((a) => a.instanceId))
  const verifiedPickable = availableInstances.filter(
    (i) => i.status === 'VERIFIED' && !attachedIds.has(i.id),
  )
  const pendingCerts = availableInstances.filter(
    (i) => i.status === 'PENDING_REVIEW' && !attachedIds.has(i.id),
  )

  function refresh() {
    router.refresh()
  }

  function detach(instanceId: string, name: string) {
    if (!confirm(`Remove ${name} from this product?`)) return
    startTransition(async () => {
      const result = await detachCertificate({ productTemplateId, instanceId })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      refresh()
    })
  }

  function attach(instanceId: string) {
    startTransition(async () => {
      const result = await attachCertificate({ productTemplateId, instanceId })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      refresh()
    })
  }

  return (
    <div className="space-y-3">
      {/* Attached list */}
      {attached.length === 0 ? (
        <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-4 text-center text-sm text-zinc-500">
          No certificates attached yet. Optional — but verified certs become public badges.
        </div>
      ) : (
        <ul className="space-y-2">
          {attached.map((a) => (
            <li
              key={a.instanceId}
              className="flex items-start justify-between gap-3 rounded-md border border-zinc-200 bg-white p-3"
            >
              <div className="flex items-start gap-2">
                <Award className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                <div>
                  <div className="font-medium text-zinc-900">{a.certName}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-zinc-500">
                    {a.certificateNumber && <span>#{a.certificateNumber}</span>}
                    <span>Expires {new Date(a.expiryDate).toLocaleDateString()}</span>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                      Verified
                    </span>
                  </div>
                </div>
              </div>
              {isDraft && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => detach(a.instanceId, a.certName)}
                  disabled={isPending}
                  className="text-red-600 hover:bg-red-50"
                  aria-label={`Remove ${a.certName}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Pickable VERIFIED instances */}
      {isDraft && verifiedPickable.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Add a certificate
          </div>
          <ul className="space-y-1.5">
            {verifiedPickable.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium text-zinc-900">{c.certName}</div>
                  {c.certificateNumber && (
                    <div className="text-xs text-zinc-500">#{c.certificateNumber}</div>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={() => attach(c.id)}
                  disabled={isPending}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Attach
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pending certs reminder */}
      {pendingCerts.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <Clock className="-mt-0.5 mr-1 inline h-3.5 w-3.5" />
          You have {pendingCerts.length} certificate
          {pendingCerts.length === 1 ? '' : 's'} pending admin review (
          {pendingCerts.map((c) => c.certName).join(', ')}). They&apos;ll be attachable once
          verified.
        </div>
      )}

      {/* No certs at all */}
      {availableInstances.length === 0 && isDraft && (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          <AlertTriangle className="-mt-0.5 mr-1 inline h-3.5 w-3.5 text-zinc-500" />
          You haven&apos;t claimed any certifications yet.{' '}
          <Link href="/certifications" className="font-medium text-emerald-700 underline">
            Claim NSF / USDA Organic / etc.
          </Link>{' '}
          to make them attachable.
        </div>
      )}

      <p className="text-xs text-zinc-500">
        💡 Verified certs render as branded badges on the public product detail page (creator
        marketplace). PDFs stay private to admin.{' '}
        <Link href="/certifications" className="text-emerald-700 hover:underline">
          Manage your certifications
          <ExternalLink className="-mt-0.5 ml-0.5 inline h-3 w-3" />
        </Link>
      </p>
    </div>
  )
}
