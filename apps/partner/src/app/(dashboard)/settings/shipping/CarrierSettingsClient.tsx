'use client'

// Phase L2a — interactive half of /settings/shipping (page.tsx stays a server
// component). Enable-platform-shipping button + BYO carrier-account form +
// account list with deactivate. Restyled 2026-07-12 to the settings-hub
// prototype panels (panel-kit PanelCard/StPill/LRow) — actions unchanged.

import { Button, Input, Label } from '@ilaunchify/ui'
import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Truck } from 'lucide-react'
import { LRow, PanelCard, StPill } from '@/components/panel-kit'
import {
  enablePlatformShipping,
  saveByoCarrierAccount,
  deactivateCarrierAccount,
} from './actions'

export interface CarrierAccountView {
  id: string
  type: string
  externalRef: string
  createdAt: string
}

export function CarrierSettingsClient({
  platformAccount,
  byoAccounts,
  envConfigured,
}: {
  platformAccount: CarrierAccountView | null
  byoAccounts: CarrierAccountView[]
  /** EASYPOST_API_KEY present server-side (boolean only — never the key). */
  envConfigured: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [byoRef, setByoRef] = useState('')

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setBusy(true)
    try {
      const r = await fn()
      if (!r.ok) {
        toast.error(r.error ?? 'Failed')
        return
      }
      toast.success(success)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Platform account (default) */}
      <PanelCard className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-[15px] font-bold text-ink-900">
            iLaunchify shipping
          </h2>
          <StPill tone={platformAccount ? 'ok' : 'muted'}>
            {platformAccount ? 'Active · default' : 'Not enabled'}
          </StPill>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-600">
          The default. We open a shipping sub-account for you on the platform&rsquo;s carrier
          rail — you buy discounted parcel labels right from a dispatch, postage is billed
          through iLaunchify, and tracking syncs back automatically. No carrier contracts needed.
        </p>
        {platformAccount ? (
          <p className="mt-4 text-[12px] text-ink-500">
            Account ref <span className="font-mono">{platformAccount.externalRef}</span> · enabled{' '}
            {new Date(platformAccount.createdAt).toLocaleDateString()}
          </p>
        ) : (
          <>
            <Button
              className="mt-4 w-full"
              onClick={() => run(enablePlatformShipping, 'iLaunchify shipping enabled')}
              disabled={busy || !envConfigured}
            >
              Enable iLaunchify shipping
            </Button>
            {!envConfigured && (
              <p className="mt-2 text-[11.5px] text-warning-700">
                Shipping isn&rsquo;t configured on this environment yet — check back soon.
              </p>
            )}
          </>
        )}
      </PanelCard>

      {/* BYO */}
      <PanelCard className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-[15px] font-bold text-ink-900">
            Bring your own carrier account
          </h2>
          <StPill tone={byoAccounts.length > 0 ? 'ok' : 'muted'}>
            {byoAccounts.length > 0 ? `${byoAccounts.length} connected` : 'None'}
          </StPill>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-600">
          Already have negotiated UPS/FedEx rates? Connect them and rate quotes use your
          pricing (billed to your carrier account). For now, iLaunchify support sets up the
          connection and sends you a carrier-account id (<span className="font-mono">ca_…</span>)
          to paste below — a full self-serve credential flow is coming.
        </p>

        {byoAccounts.length > 0 && (
          <div className="mt-4">
            {byoAccounts.map((a) => (
              <LRow
                key={a.id}
                icon={<Truck />}
                title={<span className="font-mono text-[12px]">{a.externalRef}</span>}
                sub={`Added ${new Date(a.createdAt).toLocaleDateString()}`}
                right={
                  <Button
                    variant="ghost"
                    className="flex-shrink-0 text-danger-700 hover:text-danger-800"
                    onClick={() =>
                      run(() => deactivateCarrierAccount({ accountId: a.id }), 'Carrier account removed')
                    }
                    disabled={busy}
                  >
                    Remove
                  </Button>
                }
              />
            ))}
          </div>
        )}

        <div className="mt-4 space-y-1.5">
          <Label htmlFor="byo-ref" className="text-[12px] font-semibold text-ink-700">
            Carrier-account id
          </Label>
          <div className="flex gap-2">
            <Input
              id="byo-ref"
              value={byoRef}
              onChange={(e) => setByoRef(e.target.value)}
              placeholder="ca_…"
              className="font-mono"
            />
            <Button
              onClick={() =>
                run(async () => {
                  const r = await saveByoCarrierAccount({ externalRef: byoRef })
                  if (r.ok) setByoRef('')
                  return r
                }, 'Carrier account connected')
              }
              disabled={busy || !byoRef.trim()}
            >
              Connect
            </Button>
          </div>
        </div>
      </PanelCard>
    </div>
  )
}
