'use client'

// Admin "Invite a partner" dialog.
// Triggered from the /partners page header. On submit, calls invitePartner()
// and shows the resulting magic-link URL the admin can copy + paste into an
// email (until Resend wiring lands).

import { useState, useTransition } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ilaunchify/ui'
import { Mail, Copy, Check, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { invitePartner } from './actions'
import type { ServiceType } from '@prisma/client'

export function InvitePartnerDialog() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [serviceType, setServiceType] = useState<ServiceType>('MANUFACTURING')
  const [result, setResult] = useState<
    | { ok: true; invitationUrl: string; created: boolean; partnerId: string }
    | null
  >(null)
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await invitePartner({ email, companyName, serviceType })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setResult(res)
    })
  }

  function handleCopy() {
    if (!result) return
    navigator.clipboard.writeText(result.invitationUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function reset() {
    setEmail('')
    setCompanyName('')
    setServiceType('MANUFACTURING')
    setResult(null)
    setCopied(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setTimeout(reset, 200)
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="mr-2 h-4 w-4" /> Invite partner
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a partner</DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="rounded-md bg-green-50 p-3 text-sm text-green-800">
              {result.created
                ? 'Invitation created. Share this link with the partner — magic-link auth lets them sign in without a password.'
                : 'Partner re-invited. Share this link to bring them back into onboarding.'}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-zinc-500">
                Invitation URL
              </Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={result.invitationUrl}
                  className="font-mono text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button type="button" variant="outline" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-zinc-500">
                Email integration ships in Phase B. Paste this into your email client for now.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button onClick={reset}>Invite another</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Partner email</Label>
              <Input
                id="invite-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ops@acmefoods.com"
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-company">Company name</Label>
              <Input
                id="invite-company"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Foods"
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Primary service</Label>
              <Select
                value={serviceType}
                onValueChange={(v) => setServiceType(v as ServiceType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MANUFACTURING">Manufacturing</SelectItem>
                  <SelectItem value="COPACKING">Co-packing</SelectItem>
                  <SelectItem value="LABEL_PRINTING">Label printing</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-zinc-500">
                The partner can add more services after they accept.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending || !email || !companyName}>
                {isPending ? (
                  'Creating…'
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" /> Generate invitation
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
