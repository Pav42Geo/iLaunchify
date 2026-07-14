'use client'

// Shared carrier + tracking fields (Etsy-pattern ship UX, Pavel 2026-07-14).
// Carrier is a dropdown (UPS/FedEx/USPS/DHL/Other→free text); typing a
// tracking number auto-selects the carrier from its format — only while the
// partner hasn't chosen one manually, so detection never fights the human.
// Used by the dispatch Ship panel, the orders-list quick-ship dialog, and the
// post-ship tracking correction form.

import { useRef, useState } from 'react'
import { Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ilaunchify/ui'
import { CARRIER_OPTIONS, detectCarrier, type CarrierOption } from '@/lib/carrier-detect'

export function CarrierTrackingFields({
  carrier,
  tracking,
  onCarrierChange,
  onTrackingChange,
  idPrefix = 'ship',
}: {
  carrier: string
  tracking: string
  onCarrierChange: (v: string) => void
  onTrackingChange: (v: string) => void
  idPrefix?: string
}) {
  // Select state derives from the carrier string; unknown values render as Other.
  const knownOption = (CARRIER_OPTIONS as readonly string[]).includes(carrier)
    ? (carrier as CarrierOption)
    : carrier
      ? 'Other'
      : ''
  const [manuallyChosen, setManuallyChosen] = useState(Boolean(carrier))
  const customRef = useRef<HTMLInputElement>(null)

  function handleTracking(v: string) {
    onTrackingChange(v)
    if (!manuallyChosen) {
      const detected = detectCarrier(v)
      if (detected) onCarrierChange(detected)
    }
  }

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-tracking`}>Tracking #</Label>
        <Input
          id={`${idPrefix}-tracking`}
          value={tracking}
          onChange={(e) => handleTracking(e.target.value)}
          placeholder="Paste the carrier tracking number"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Carrier</Label>
        <Select
          value={knownOption || undefined}
          onValueChange={(v) => {
            setManuallyChosen(true)
            onCarrierChange(v === 'Other' ? '' : v)
            if (v === 'Other') setTimeout(() => customRef.current?.focus(), 0)
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Auto-detected from tracking, or pick" />
          </SelectTrigger>
          <SelectContent>
            {CARRIER_OPTIONS.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {knownOption === 'Other' && (
          <Input
            ref={customRef}
            aria-label="Carrier name"
            value={(CARRIER_OPTIONS as readonly string[]).includes(carrier) ? '' : carrier}
            onChange={(e) => onCarrierChange(e.target.value)}
            placeholder="Carrier name"
          />
        )}
      </div>
    </>
  )
}
