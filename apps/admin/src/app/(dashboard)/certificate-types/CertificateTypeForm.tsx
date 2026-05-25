'use client'

// Shared form for /certificate-types/new and /certificate-types/[id].
// In edit mode, also surfaces thumbnail upload + status toggle.

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input, Label } from '@ilaunchify/ui'
import { toast } from 'sonner'
import { Upload, ShieldCheck } from 'lucide-react'
import type { CertificateTypeStatus } from '@prisma/client'
import {
  createCertificateType,
  updateCertificateType,
  setCertificateTypeStatus,
  uploadCertificateTypeThumbnail,
} from './actions'

interface FormProps {
  mode: 'create' | 'edit'
  typeId?: string
  initial?: {
    name: string
    slug: string
    description: string
    verificationNotes: string
    status?: CertificateTypeStatus
    hasThumbnail?: boolean
  }
}

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/

export function CertificateTypeForm({ mode, typeId, initial }: FormProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(initial?.name ?? '')
  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [verificationNotes, setVerificationNotes] = useState(initial?.verificationNotes ?? '')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [slugTouched, setSlugTouched] = useState(mode === 'edit')

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    startTransition(async () => {
      if (mode === 'create') {
        const result = await createCertificateType({ name, slug, description, verificationNotes })
        if (!result.ok) {
          setError(result.error)
          return
        }
        toast.success(`${name} added to library`)
        router.push(`/certificate-types/${result.data.id}`)
        router.refresh()
      } else if (typeId) {
        const result = await updateCertificateType({
          id: typeId,
          name,
          description,
          verificationNotes,
        })
        if (!result.ok) {
          setError(result.error)
          return
        }
        toast.success('Saved')
        router.refresh()
      }
    })
  }

  function handleThumbnail(file: File) {
    if (!typeId) return
    startTransition(async () => {
      const fd = new FormData()
      fd.set('typeId', typeId)
      fd.set('file', file)
      const result = await uploadCertificateTypeThumbnail(fd)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Thumbnail uploaded')
      router.refresh()
    })
  }

  function toggleStatus(to: CertificateTypeStatus) {
    if (!typeId) return
    startTransition(async () => {
      const result = await setCertificateTypeStatus(typeId, to)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Type ${to.toLowerCase()}`)
      router.refresh()
    })
  }

  // Auto-derive slug from name (create mode only, until user touches slug)
  function onNameChange(v: string) {
    setName(v)
    if (mode === 'create' && !slugTouched) {
      setSlug(
        v
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 42),
      )
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border border-zinc-200 bg-white p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required>
            <Input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="e.g. USDA Organic"
              required
              disabled={isPending}
            />
          </Field>
          <Field label="Slug" required hint="lowercase letters, numbers, dashes">
            <Input
              value={slug}
              onChange={(e) => {
                setSlugTouched(true)
                setSlug(e.target.value.toLowerCase())
              }}
              required
              pattern={SLUG_REGEX.source}
              disabled={isPending || mode === 'edit'}
              className={mode === 'edit' ? 'bg-zinc-50' : ''}
            />
            {mode === 'edit' && (
              <p className="text-xs text-zinc-500">
                Slug is immutable — used in URLs + R2 keys. Create a new type if you need a different one.
              </p>
            )}
          </Field>
        </div>

        <Field label="Description" required hint="Shown on hover/tooltip publicly + on the partner picker">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={2}
            className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            disabled={isPending}
          />
        </Field>

        <Field
          label="Verification notes (internal)"
          hint="Reminder for reviewers — what to check on the partner&apos;s uploaded PDF"
        >
          <textarea
            value={verificationNotes}
            onChange={(e) => setVerificationNotes(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            disabled={isPending}
          />
        </Field>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={isPending} className="bg-emerald-600 hover:bg-emerald-700">
            {isPending ? 'Saving…' : mode === 'create' ? 'Create type' : 'Save changes'}
          </Button>
        </div>
      </form>

      {mode === 'edit' && typeId && (
        <>
          {/* Thumbnail */}
          <div className="rounded-lg border border-zinc-200 bg-white p-6">
            <h3 className="font-semibold text-zinc-900">Branded badge thumbnail</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Uploaded once. Shown on creator product detail pages whenever a partner has a
              VERIFIED instance of this type. PNG with transparent background preferred,
              ~256×256.
            </p>
            <div className="mt-4 flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/svg+xml,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleThumbnail(f)
                }}
                disabled={isPending}
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isPending}
              >
                <Upload className="mr-1.5 h-4 w-4" />
                {initial?.hasThumbnail ? 'Replace thumbnail' : 'Upload thumbnail'}
              </Button>
              {initial?.hasThumbnail && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                  <ShieldCheck className="h-3.5 w-3.5" /> Uploaded
                </span>
              )}
            </div>
          </div>

          {/* Status toggle */}
          <div className="rounded-lg border border-zinc-200 bg-white p-6">
            <h3 className="font-semibold text-zinc-900">Status</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Deprecated types stay visible on existing partner instances but disappear from
              the partner picker. Use to retire a type without losing audit history.
            </p>
            <div className="mt-4">
              {initial?.status === 'ACTIVE' ? (
                <Button
                  variant="outline"
                  className="border-amber-300 text-amber-700 hover:bg-amber-50"
                  onClick={() => toggleStatus('DEPRECATED')}
                  disabled={isPending}
                >
                  Deprecate
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => toggleStatus('ACTIVE')}
                  disabled={isPending}
                >
                  Reactivate
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-zinc-900">
        {label}
        {required && (
          <span className="ml-1 text-[10px] font-medium uppercase tracking-wider text-red-600">
            Required
          </span>
        )}
      </Label>
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
      {children}
    </div>
  )
}
