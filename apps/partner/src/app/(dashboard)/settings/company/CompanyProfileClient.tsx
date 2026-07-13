'use client'

// Company profile editor — 1:1 port of the prototype's #p-company panel
// (design/partner-profile-prototype-v2.html): dark cover band → avatar row →
// Legal identity → Public bio & positioning (tagline charcount, about, best-for
// chips) → Facilities & label disclosure (seg-radio) → Verification documents →
// sticky savebar (autosave indicator + Preview + Publish).
//
// Autosave: fields save on blur via the audited saveCompanyProfile action.
// Disclosure + publish are explicit actions. Cover/logo image upload is the
// next slice — the slots render per the prototype but aren't interactive yet.

import { useRef, useState, useTransition } from 'react'
import { cn } from '@ilaunchify/ui'
import {
  Building2,
  Camera,
  Check,
  Download,
  Eye,
  FileText,
  Loader2,
  MapPin,
  Megaphone,
  X,
} from 'lucide-react'
import { saveCompanyProfile, saveFacilityAddress, setProfilePublished } from './actions'
import { uploadPartnerProfileImage, removePartnerProfileImage } from './media-actions'
import { replaceVerificationDocument, getVerificationDocUrl } from './docs-actions'
import { FacilitiesManager, type FacilityVM } from './FacilitiesManager'
import { COUNTRIES } from '@/lib/us-states'
import { RegionSelect } from './RegionSelect'

export interface DocSlotVM {
  kind: 'CERT_OF_INCORPORATION' | 'BUSINESS_LICENSE' | 'INSURANCE'
  label: string
  filename: string | null
  uploadedAt: string | null
  expiresAt: string | null
  sectionStatus: string
  sectionVerifiedAt: string | null
}

export interface CompanyProfileInitial {
  companyName: string
  legalName: string
  websiteUrl: string
  contactPhone: string
  tagline: string
  about: string
  bestForTags: string[]
  logoUrl: string | null
  coverImageUrl: string | null
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  postalCode: string
  country: string
  approved: boolean
  businessReviewPending: boolean
  docSlots: DocSlotVM[]
  hasNameableService: boolean
  disclosure: string
  published: boolean
  previewHref: string | null
  facilities: FacilityVM[]
}

type SaveState = 'saved' | 'saving' | 'dirty'

export function CompanyProfileClient({ initial }: { initial: CompanyProfileInitial }) {
  const [f, setF] = useState(initial)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [tagDraft, setTagDraft] = useState('')
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const dirtyRef = useRef(false)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)

  const uploadImage = (kind: 'logo' | 'cover', file: File | undefined) => {
    if (!file) return
    setMediaError(null)
    if (file.size > 6 * 1024 * 1024) {
      setMediaError('Image too large (max 6 MB).')
      return
    }
    setSaveState('saving')
    const fd = new FormData()
    fd.set('file', file)
    startTransition(async () => {
      try {
        const res = await uploadPartnerProfileImage(kind, fd)
        if (res.ok) setF((p) => ({ ...p, [kind === 'logo' ? 'logoUrl' : 'coverImageUrl']: res.url }))
        else setMediaError(res.error)
      } catch (err) {
        // Network / body-limit failures reject the action promise — surface them.
        setMediaError(`Upload failed: ${(err as Error).message || 'network error'}`)
      }
      setSaveState('saved')
    })
  }

  const removeImage = (kind: 'logo' | 'cover') => {
    setMediaError(null)
    setSaveState('saving')
    startTransition(async () => {
      try {
        const res = await removePartnerProfileImage(kind)
        if (res.ok) setF((p) => ({ ...p, [kind === 'logo' ? 'logoUrl' : 'coverImageUrl']: null }))
        else setMediaError(res.error)
      } catch (err) {
        setMediaError(`Remove failed: ${(err as Error).message || 'network error'}`)
      }
      setSaveState('saved')
    })
  }

  const set = <K extends keyof CompanyProfileInitial>(k: K, v: CompanyProfileInitial[K]) => {
    setF((p) => ({ ...p, [k]: v }))
    dirtyRef.current = true
    setSaveState('dirty')
  }

  const flush = () => {
    if (!dirtyRef.current) return
    dirtyRef.current = false
    setSaveState('saving')
    startTransition(async () => {
      await saveCompanyProfile({
        companyName: f.companyName,
        legalName: f.legalName,
        websiteUrl: f.websiteUrl,
        contactPhone: f.contactPhone,
        tagline: f.tagline,
        about: f.about,
        bestForTags: f.bestForTags,
      })
      setSaveState('saved')
    })
  }

  // Address autosave — separate action: on an approved account it flips the
  // BUSINESS verification section back to PENDING (identity re-review).
  const addressDirtyRef = useRef(false)
  const setAddr = (
    k: 'addressLine1' | 'addressLine2' | 'city' | 'state' | 'postalCode' | 'country',
    v: string,
  ) => {
    // Switching country invalidates the region code (different option list).
    setF((p) => (k === 'country' ? { ...p, country: v, state: '' } : { ...p, [k]: v }))
    addressDirtyRef.current = true
    setSaveState('dirty')
  }
  const flushAddress = () => {
    if (!addressDirtyRef.current) return
    addressDirtyRef.current = false
    setSaveState('saving')
    startTransition(async () => {
      await saveFacilityAddress({
        addressLine1: f.addressLine1,
        addressLine2: f.addressLine2,
        city: f.city,
        state: f.state,
        postalCode: f.postalCode,
        country: f.country,
      })
      if (f.approved) setF((p) => ({ ...p, businessReviewPending: true }))
      setSaveState('saved')
    })
  }

  const saveTags = (tags: string[]) => {
    setF((p) => ({ ...p, bestForTags: tags }))
    setSaveState('saving')
    startTransition(async () => {
      await saveCompanyProfile({ bestForTags: tags })
      setSaveState('saved')
    })
  }

  const togglePublish = () => {
    const next = !f.published
    setF((p) => ({ ...p, published: next }))
    setSaveState('saving')
    startTransition(async () => {
      await setProfilePublished(next)
      setSaveState('saved')
    })
  }

  const initialChar = f.companyName.charAt(0).toUpperCase() || 'C'

  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm sm:p-7">
      {/* cover band */}
      <div
        className="relative h-[130px] overflow-hidden rounded-xl"
        style={
          f.coverImageUrl
            ? { background: `center / cover url(${f.coverImageUrl})` }
            : {
                background:
                  'radial-gradient(120% 150% at 80% -10%, rgba(181,255,61,.16), transparent 55%), radial-gradient(100% 140% at 10% 120%, rgba(255,46,99,.28), transparent 60%), linear-gradient(120deg, #1d1d20, #232327)',
              }
        }
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="absolute bottom-3 right-3 flex gap-2">
          {f.coverImageUrl && (
            <button
              type="button"
              onClick={() => removeImage('cover')}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-white/20"
            >
              <X className="h-3.5 w-3.5" />
              Remove
            </button>
          )}
          <button
            type="button"
            onClick={() => coverInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-white/20"
          >
            <Camera className="h-3.5 w-3.5" />
            Edit cover
          </button>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              uploadImage('cover', e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>
        {mediaError && (
          <div className="absolute bottom-3 left-3 rounded-lg bg-ink-900/80 px-3 py-1.5 text-[12px] font-semibold text-white">
            {mediaError}
          </div>
        )}
      </div>

      {/* avatar row */}
      <div className="relative z-[2] -mt-[46px] mb-5 ml-3 flex items-end gap-4">
        <div
          className="relative grid h-24 w-24 place-items-center overflow-hidden rounded-[22px] border-4 border-white shadow-md"
          style={
            f.logoUrl
              ? { background: `center / cover url(${f.logoUrl})` }
              : { background: 'linear-gradient(135deg, var(--pink-500), var(--pink-700))' }
          }
        >
          {!f.logoUrl && (
            <span className="font-display text-[34px] font-extrabold text-white">{initialChar}</span>
          )}
          <button
            type="button"
            aria-label="Upload logo"
            onClick={() => logoInputRef.current?.click()}
            className="absolute -bottom-1 -right-1 grid h-[30px] w-[30px] place-items-center rounded-full border border-ink-200 bg-white shadow-sm transition-colors hover:bg-ink-50"
          >
            <Camera className="h-[15px] w-[15px] text-ink-700" />
          </button>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              uploadImage('logo', e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>
        <div className="pb-1.5">
          <div className="text-[14px] font-semibold text-ink-900">Company logo</div>
          <div className="text-[12px] text-ink-500">PNG or SVG · square · min 400×400</div>
          {f.logoUrl && (
            <button
              type="button"
              onClick={() => removeImage('logo')}
              className="mt-1 text-[12px] font-semibold text-ink-500 underline underline-offset-2 hover:text-ink-900"
            >
              Remove logo
            </button>
          )}
          {mediaError && <p className="mt-1 text-[12px] font-semibold text-danger-500">{mediaError}</p>}
        </div>
      </div>

      {/* Legal identity */}
      <Fieldset icon={<Building2 className="h-4 w-4" />} title="Legal identity" hint="companyName · legalName">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Doing-business-as (DBA)" required help="Public display name.">
            <input
              value={f.companyName}
              onChange={(e) => set('companyName', e.target.value)}
              onBlur={flush}
              className={inputCls}
            />
          </Field>
          <Field label="Legal entity name" required help="Exactly as on incorporation docs · private.">
            <input
              value={f.legalName}
              onChange={(e) => set('legalName', e.target.value)}
              onBlur={flush}
              className={inputCls}
            />
          </Field>
          <Field label="Website">
            <input
              value={f.websiteUrl}
              onChange={(e) => set('websiteUrl', e.target.value)}
              onBlur={flush}
              placeholder="https://"
              className={inputCls}
            />
          </Field>
          <Field label="Primary phone">
            <input
              value={f.contactPhone}
              onChange={(e) => set('contactPhone', e.target.value)}
              onBlur={flush}
              className={inputCls}
            />
          </Field>
        </div>
      </Fieldset>

      {/* Public bio & positioning */}
      <Fieldset icon={<Megaphone className="h-4 w-4" />} title="Public bio & positioning">
        <Field
          label="Tagline"
          counter={`${f.tagline.length} / 90`}
          help="One line under your name on the profile — it renders in Fraunces italic."
        >
          <input
            value={f.tagline}
            maxLength={90}
            onChange={(e) => set('tagline', e.target.value)}
            onBlur={flush}
            className={inputCls}
          />
        </Field>
        <Field
          label="About"
          counter={`${f.about.length} / 600`}
          help="Wrap your differentiator in *asterisks* — it renders in Fraunces italic on your profile."
        >
          <textarea
            value={f.about}
            maxLength={600}
            rows={4}
            onChange={(e) => set('about', e.target.value)}
            onBlur={flush}
            className={cn(inputCls, 'min-h-[78px] resize-y')}
          />
        </Field>
        <Field label="Best-for tags (max 5)">
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {f.bestForTags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-full border border-pink-100 bg-pink-50 px-2.5 py-[5px] text-[12px] font-medium text-pink-700"
              >
                {t}
                <button
                  type="button"
                  aria-label={`Remove ${t}`}
                  onClick={() => saveTags(f.bestForTags.filter((x) => x !== t))}
                  className="hover:text-pink-900"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {f.bestForTags.length < 5 && (
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && tagDraft.trim()) {
                    e.preventDefault()
                    saveTags([...f.bestForTags, tagDraft.trim()])
                    setTagDraft('')
                  }
                }}
                placeholder="Add a tag ↵"
                className="w-36 rounded-md border border-ink-300 px-2.5 py-1.5 text-[12.5px] focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/15"
              />
            )}
          </div>
        </Field>
      </Fieldset>

      {/* Facilities & label disclosure */}
      <Fieldset icon={<MapPin className="h-4 w-4" />} title="Facilities & label disclosure" hint="disclosureLevel">
        {f.hasNameableService ? (
          // Disclosure is an iLaunchify ADMIN decision (Pavel 2026-07-12) —
          // shown read-only here so the partner knows their current level,
          // never as a self-serve control.
          <Field
            label="Label & marketplace disclosure"
            help={
              f.disclosure === 'FULL'
                ? `Full = "Manufactured by ${f.companyName}${f.city ? `, ${f.city}` : ''}${f.state ? `, ${f.state}` : ''}" — your name appears on product pages and your public profile is reachable.`
                : 'Your name stays hidden on product pages and your public profile is unreachable at this level.'
            }
          >
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-200 bg-ink-50 px-4 py-3">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-bold',
                  f.disclosure === 'FULL'
                    ? 'border-success-100 bg-success-50 text-success-700'
                    : 'border-ink-200 bg-white text-ink-600',
                )}
              >
                {f.disclosure === 'FULL'
                  ? 'Full "Manufactured by"'
                  : f.disclosure === 'CITY_STATE'
                    ? 'City + State'
                    : 'Anonymous'}
              </span>
              <span className="text-[12px] text-ink-500">
                Set by iLaunchify based on your verification standing.
              </span>
              <a
                href="/help"
                className="ml-auto rounded-full border border-ink-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-700 hover:bg-ink-50"
              >
                Request a change →
              </a>
            </div>
          </Field>
        ) : (
          <p className="text-[12.5px] text-ink-500">
            Disclosure applies to Manufacturing / Co-packing services — none on this account yet.
          </p>
        )}
        <Field
          label="Primary facility · street address"
          help="Address changes on an approved account re-enter identity review — your services keep routing while the new address is verified."
        >
          <input
            value={f.addressLine1}
            onChange={(e) => setAddr('addressLine1', e.target.value)}
            onBlur={flushAddress}
            placeholder="Street address"
            className={inputCls}
          />
          <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <select
              value={f.country}
              onChange={(e) => setAddr('country', e.target.value)}
              onBlur={flushAddress}
              className={inputCls}
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              value={f.city}
              onChange={(e) => setAddr('city', e.target.value)}
              onBlur={flushAddress}
              placeholder="City"
              className={inputCls}
            />
            <RegionSelect
              country={f.country}
              value={f.state}
              onChange={(v) => setAddr('state', v)}
              onBlur={flushAddress}
            />
            <input
              value={f.postalCode}
              onChange={(e) => setAddr('postalCode', e.target.value)}
              onBlur={flushAddress}
              placeholder={f.country === 'CA' ? 'Postal code' : 'ZIP'}
              className={inputCls}
            />
          </div>
          {f.businessReviewPending && (
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-warning-100 bg-warning-50 px-2.5 py-[3px] text-[11px] font-bold text-warning-700">
              <Loader2 className="h-3 w-3" />
              Identity re-review pending
            </span>
          )}
        </Field>
        <div className="mt-1">
          <div className="mb-2 text-[12px] font-semibold text-ink-700">Facilities</div>
          <FacilitiesManager facilities={f.facilities} />
        </div>
      </Fieldset>

      {/* Verification documents — per-document slots (prototype docslots).
          Replace / renew uploads go through the real onboarding rail and, on an
          approved account, flip the DOCUMENTS section back into admin review. */}
      <Fieldset icon={<FileText className="h-4 w-4" />} title="Verification documents" hint="Private · admin-reviewed">
        {f.docSlots.map((slot) => (
          <DocSlot key={slot.kind} slot={slot} />
        ))}
        <p className="mt-2 text-[11px] text-ink-500">
          Replacements re-enter admin review; your services keep routing while the new document is
          verified.
        </p>
      </Fieldset>

      {/* savebar */}
      <div className="sticky bottom-0 -mx-6 -mb-6 mt-5 flex items-center gap-3 border-t border-ink-200 bg-white px-6 py-3.5 sm:-mx-7 sm:-mb-7 sm:px-7">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 text-[12.5px]',
            saveState === 'saved' ? 'text-success-700' : 'text-ink-500',
          )}
        >
          {saveState === 'saving' || pending ? (
            <>
              <Loader2 className="h-[15px] w-[15px] animate-spin" />
              Saving…
            </>
          ) : saveState === 'dirty' ? (
            'Unsaved changes'
          ) : (
            <>
              <Check className="h-[15px] w-[15px]" />
              All changes saved · autosaves
            </>
          )}
        </span>
        <div className="ml-auto flex items-center gap-2.5">
          {f.previewHref && (
            <a
              href={f.previewHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-4 py-2 text-[13px] font-semibold text-ink-900 hover:bg-ink-50"
            >
              <Eye className="h-3.5 w-3.5" />
              View public profile
            </a>
          )}
          <button
            type="button"
            onClick={togglePublish}
            disabled={pending || (!f.published && f.disclosure !== 'FULL' && f.hasNameableService)}
            title={
              !f.published && f.disclosure !== 'FULL' && f.hasNameableService
                ? 'Publishing unlocks once iLaunchify sets your disclosure to Full "Manufactured by"'
                : undefined
            }
            className={cn(
              'rounded-full px-4 py-2 text-[13px] font-semibold transition-colors',
              f.published
                ? 'border border-ink-300 bg-white text-ink-900 hover:bg-ink-50'
                : 'bg-ink-900 text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-40',
            )}
          >
            {f.published ? 'Unpublish profile' : 'Publish profile'}
          </button>
        </div>
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-md border border-ink-300 bg-white px-3 py-2.5 text-[13.5px] text-ink-900 transition-all focus:border-pink-500 focus:outline-none focus:ring-[3px] focus:ring-pink-500/15'

// -----------------------------------------------------------------------------
// Verification document slot (prototype .docslot) — real replace/renew rail
// -----------------------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

function DocSlot({ slot }: { slot: DocSlotVM }) {
  const [error, setError] = useState<string | null>(null)
  const [expiry, setExpiry] = useState('')
  const [pending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  const needsExpiry = slot.kind === 'INSURANCE'
  const expiringSoon =
    slot.expiresAt != null && new Date(slot.expiresAt).getTime() <= Date.now() + 30 * DAY
  const daysLeft = slot.expiresAt
    ? Math.max(0, Math.ceil((new Date(slot.expiresAt).getTime() - Date.now()) / DAY))
    : null
  const missing = slot.filename == null
  const inReview = !missing && slot.sectionStatus !== 'VERIFIED'
  const done = !missing && slot.sectionStatus === 'VERIFIED' && !expiringSoon

  const meta = missing
    ? 'Not uploaded yet'
    : [
        slot.filename,
        slot.uploadedAt ? `uploaded ${fmtDate(slot.uploadedAt)}` : null,
        slot.expiresAt
          ? expiringSoon
            ? `renewal in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`
            : `expires ${fmtDate(slot.expiresAt)}`
          : null,
        inReview ? 'in admin review' : slot.sectionVerifiedAt ? `verified ${fmtDate(slot.sectionVerifiedAt)}` : null,
      ]
        .filter(Boolean)
        .join(' · ')

  const upload = (file: File | undefined) => {
    if (!file) return
    if (needsExpiry && !expiry) {
      setError('Enter the new expiry date printed on the certificate first.')
      return
    }
    setError(null)
    const fd = new FormData()
    fd.set('file', file)
    if (needsExpiry && expiry) fd.set('expiresAt', expiry)
    startTransition(async () => {
      try {
        const res = await replaceVerificationDocument(slot.kind, fd)
        if (!res.ok) setError(res.error)
      } catch (err) {
        setError(`Upload failed: ${(err as Error).message || 'network error'}`)
      }
    })
  }

  const download = () => {
    setError(null)
    startTransition(async () => {
      try {
        const res = await getVerificationDocUrl(slot.kind)
        if (res.ok) window.open(res.url, '_blank', 'noopener')
        else setError(res.error)
      } catch (err) {
        setError(`Download failed: ${(err as Error).message || 'network error'}`)
      }
    })
  }

  return (
    <div className="mb-2.5 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-ink-300 px-3.5 py-[13px] last:mb-0">
      <span
        className={cn(
          'grid h-9 w-9 flex-none place-items-center rounded-[9px]',
          done && 'bg-success-50 text-success-600',
          (expiringSoon || inReview) && 'bg-warning-50 text-warning-500',
          missing && 'bg-ink-100 text-ink-400',
        )}
      >
        {done ? <Check className="h-[18px] w-[18px]" /> : <Loader2 className={cn('h-[18px] w-[18px]', pending && 'animate-spin')} />}
      </span>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-ink-900">{slot.label}</div>
        <div className="truncate text-[11px] text-ink-500">{meta}</div>
        {expiringSoon && (
          <div className="text-[11px] font-semibold text-warning-700">
            Already have the renewed certificate? Set its expiry date and upload it now.
          </div>
        )}
        {error && <div className="text-[11px] font-semibold text-danger-500">{error}</div>}
      </div>
      <div className="ml-auto flex flex-none flex-wrap items-center gap-2">
        {!missing && (
          <button
            type="button"
            disabled={pending}
            onClick={download}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </button>
        )}
        {needsExpiry && (
          <input
            type="date"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            title="New expiry date (printed on the certificate)"
            className="rounded-md border border-ink-300 px-2 py-1.5 text-[12px] text-ink-700 focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/15"
          />
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => fileRef.current?.click()}
          className={cn(
            'rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-40',
            missing || expiringSoon
              ? 'bg-pink-500 text-white hover:bg-pink-600'
              : 'border border-ink-300 bg-white text-ink-900 hover:bg-ink-50',
          )}
        >
          {missing ? 'Upload' : expiringSoon ? 'Upload renewal' : 'Replace'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            upload(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}

function Fieldset({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-[18px] rounded-2xl border border-ink-200 p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-lg bg-pink-50 text-pink-700">
          {icon}
        </span>
        <h4 className="font-display text-[15px] font-bold text-ink-900">{title}</h4>
        {hint && <span className="ml-auto text-[11px] text-ink-400">{hint}</span>}
      </div>
      <div className="space-y-3.5">{children}</div>
    </div>
  )
}

function Field({
  label,
  required,
  counter,
  help,
  children,
}: {
  label: string
  required?: boolean
  counter?: string
  help?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-semibold text-ink-700">
        {label} {required && <span className="text-pink-600">*</span>}
        {counter && <span className="float-right text-[11px] font-normal text-ink-400">{counter}</span>}
      </label>
      {children}
      {help && <p className="mt-1.5 text-[11px] text-ink-500">{help}</p>}
    </div>
  )
}
