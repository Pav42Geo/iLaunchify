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
  Eye,
  FileText,
  Loader2,
  MapPin,
  Megaphone,
  Warehouse,
  X,
} from 'lucide-react'
import {
  saveCompanyProfile,
  setDisclosureLevel,
  setProfilePublished,
  type DisclosureLevelKey,
} from './actions'
import { uploadPartnerProfileImage, removePartnerProfileImage } from './media-actions'

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
  city: string
  state: string
  hasNameableService: boolean
  disclosure: string
  published: boolean
  previewHref: string | null
  facilities: { name: string; city: string; region: string; isDefault: boolean }[]
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
    setSaveState('saving')
    const fd = new FormData()
    fd.set('file', file)
    startTransition(async () => {
      const res = await uploadPartnerProfileImage(kind, fd)
      if (res.ok) setF((p) => ({ ...p, [kind === 'logo' ? 'logoUrl' : 'coverImageUrl']: res.url }))
      else setMediaError(res.error)
      setSaveState('saved')
    })
  }

  const removeImage = (kind: 'logo' | 'cover') => {
    setMediaError(null)
    setSaveState('saving')
    startTransition(async () => {
      const res = await removePartnerProfileImage(kind)
      if (res.ok) setF((p) => ({ ...p, [kind === 'logo' ? 'logoUrl' : 'coverImageUrl']: null }))
      else setMediaError(res.error)
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

  const saveTags = (tags: string[]) => {
    setF((p) => ({ ...p, bestForTags: tags }))
    setSaveState('saving')
    startTransition(async () => {
      await saveCompanyProfile({ bestForTags: tags })
      setSaveState('saved')
    })
  }

  const changeDisclosure = (level: DisclosureLevelKey) => {
    set('disclosure', level)
    dirtyRef.current = false
    setSaveState('saving')
    startTransition(async () => {
      await setDisclosureLevel(level)
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
        <Field label="About" counter={`${f.about.length} / 600`}>
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
          <Field
            label="How your name appears on labels & the marketplace"
            help={
              f.disclosure === 'FULL'
                ? `Full = "Manufactured by ${f.companyName}${f.city ? `, ${f.city}` : ''}${f.state ? `, ${f.state}` : ''}" — also unlocks your public profile.`
                : 'Anonymous / City + State keep your name hidden — your public profile stays unreachable.'
            }
          >
            <div className="inline-flex w-fit overflow-hidden rounded-md border border-ink-300">
              {(
                [
                  ['ANONYMOUS', 'Anonymous'],
                  ['CITY_STATE', 'City + State'],
                  ['FULL', 'Full "Manufactured by"'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => changeDisclosure(key)}
                  className={cn(
                    'px-[18px] py-2 text-[13px] font-semibold transition-colors',
                    f.disclosure === key ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-50',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>
        ) : (
          <p className="text-[12.5px] text-ink-500">
            Disclosure applies to Manufacturing / Co-packing services — none on this account yet.
          </p>
        )}
        <Field label="Primary facility · street address">
          <input value={f.addressLine1} disabled className={cn(inputCls, 'bg-ink-50 text-ink-500')} />
          <p className="mt-1 text-[11px] text-ink-500">
            Address changes go through your application (identity re-review).
          </p>
        </Field>
        {f.facilities
          .filter((fac) => !fac.isDefault)
          .map((fac) => (
            <div
              key={fac.name}
              className="flex items-center gap-3.5 rounded-xl border border-ink-200 px-4 py-[15px]"
            >
              <span className="grid h-10 w-10 flex-none place-items-center rounded-[10px] bg-ink-50 text-ink-600">
                <Warehouse className="h-[19px] w-[19px]" />
              </span>
              <div>
                <div className="text-[14px] font-semibold text-ink-900">
                  {fac.city}, {fac.region} — {fac.name}
                </div>
                <div className="text-[12px] text-ink-500">Additional facility</div>
              </div>
              <span className="ml-auto inline-flex items-center rounded-full border border-ink-200 bg-ink-100 px-2.5 py-[3px] text-[11px] font-semibold text-ink-600">
                Secondary
              </span>
            </div>
          ))}
      </Fieldset>

      {/* Verification documents */}
      <Fieldset icon={<FileText className="h-4 w-4" />} title="Verification documents" hint="Private · admin-reviewed">
        <div className="flex items-center gap-3.5 rounded-xl border border-dashed border-ink-300 px-4 py-[13px]">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-[9px] bg-success-50 text-success-600">
            <Check className="h-[18px] w-[18px]" />
          </span>
          <div>
            <div className="text-[13px] font-semibold text-ink-900">
              Incorporation · business license · liability insurance
            </div>
            <div className="text-[11px] text-ink-500">
              Managed in your application — replacements re-enter admin review.
            </div>
          </div>
          <a
            href="/my-application"
            className="ml-auto rounded-full border border-ink-300 bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink-900 hover:bg-ink-50"
          >
            Manage →
          </a>
        </div>
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
                ? 'Set disclosure to Full "Manufactured by" to publish'
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
