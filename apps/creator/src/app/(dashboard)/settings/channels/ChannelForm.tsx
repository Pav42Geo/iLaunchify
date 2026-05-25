'use client'

import { useState, useTransition } from 'react'
import { Button, Input, Label } from '@ilaunchify/ui'
import { ShoppingBag, Store, Globe, MoreHorizontal, HelpCircle } from 'lucide-react'
import type { ComponentType } from 'react'
import { saveChannelChoice, type ChannelChoice } from '../../_actions/checklist-actions'

interface ChannelOption {
  value: ChannelChoice
  label: string
  description: string
  icon: ComponentType<{ className?: string }>
}

const OPTIONS: ChannelOption[] = [
  {
    value: 'SHOPIFY',
    label: 'Shopify storefront',
    description: 'Your own DTC shop powered by Shopify.',
    icon: ShoppingBag,
  },
  {
    value: 'AMAZON',
    label: 'Amazon (Seller Central)',
    description: 'FBA, FBM, or seller-fulfilled prime.',
    icon: Store,
  },
  {
    value: 'BRAND_SITE',
    label: 'Brand website',
    description: 'Custom site on Webflow / Framer / Squarespace / etc.',
    icon: Globe,
  },
  {
    value: 'OTHER',
    label: 'Other / multiple',
    description: 'Mix of channels or something not listed.',
    icon: MoreHorizontal,
  },
  {
    value: 'NOT_SURE',
    label: 'Not sure yet',
    description: 'I&apos;ll figure this out later. Skip for now.',
    icon: HelpCircle,
  },
]

export function ChannelForm({
  initialChannel,
  initialUrl,
}: {
  initialChannel: ChannelChoice | ''
  initialUrl: string
}) {
  const [channel, setChannel] = useState<ChannelChoice | ''>(initialChannel)
  const [url, setUrl] = useState(initialUrl)
  const [isPending, startTransition] = useTransition()
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  function commit(next: { channel: ChannelChoice; url: string }) {
    setSaveStatus('saving')
    startTransition(async () => {
      const result = await saveChannelChoice(next)
      if (result.ok) {
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
      } else {
        setSaveStatus('error')
      }
    })
  }

  function pickChannel(c: ChannelChoice) {
    setChannel(c)
    commit({ channel: c, url })
  }

  return (
    <div className="space-y-6 rounded-lg border border-zinc-200 bg-white p-6">
      <div className="flex justify-end">
        <SaveIndicator status={saveStatus} pending={isPending} />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium text-zinc-900">Your primary channel</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {OPTIONS.map((opt) => {
            const Icon = opt.icon
            const selected = channel === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => pickChannel(opt.value)}
                className={`flex items-start gap-3 rounded-md border p-3 text-left transition-colors ${
                  selected
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-zinc-200 bg-white hover:bg-zinc-50'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md ${
                    selected ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-600'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="font-medium text-zinc-900">{opt.label}</div>
                  <div
                    className="mt-0.5 text-xs text-zinc-500"
                    // Decorative apostrophe in NOT_SURE description is fine inside button
                    dangerouslySetInnerHTML={{ __html: opt.description }}
                  />
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* URL only when relevant */}
      {(channel === 'SHOPIFY' || channel === 'AMAZON' || channel === 'BRAND_SITE' || channel === 'OTHER') && (
        <div className="space-y-1.5">
          <Label htmlFor="channelUrl" className="text-sm font-medium text-zinc-900">
            Channel URL (optional)
          </Label>
          <Input
            id="channelUrl"
            placeholder={channel === 'AMAZON' ? 'amazon.com/dp/...' : 'https://yourshop.com'}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => channel && commit({ channel, url })}
          />
          <p className="text-xs text-zinc-500">
            Just so our team can take a look — never published anywhere.
          </p>
        </div>
      )}
    </div>
  )
}

function SaveIndicator({
  status,
  pending,
}: {
  status: 'idle' | 'saving' | 'saved' | 'error'
  pending: boolean
}) {
  if (status === 'idle' && !pending) return null
  const display = pending ? 'saving' : status
  const text = { saving: 'Saving…', saved: '✓ Saved', error: '⚠ Save failed', idle: '' }[display]
  const cls = {
    saving: 'text-zinc-500',
    saved: 'text-emerald-600',
    error: 'text-red-600',
    idle: '',
  }[display]
  return <span className={`text-xs ${cls}`}>{text}</span>
}
