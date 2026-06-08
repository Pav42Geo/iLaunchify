// Partner — request a new certificate type (C3). When the cert a partner
// carries isn't in the admin library yet, they request it here; admins triage
// in /admin/certificate-requests.

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { RequestCertTypeForm } from './RequestCertTypeForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Request a certificate type — iLaunchify Partners' }

export default function RequestCertificateTypePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <Link
          href="/certifications"
          className="mb-2 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to certifications
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Request a new certificate type</h1>
        <p className="mt-1 text-sm text-ink-500">
          Carry a certification we don&apos;t list yet? Tell us about it. An admin reviews each
          request — once approved it joins the library and you can claim it with your PDF.
        </p>
      </header>

      <RequestCertTypeForm />
    </div>
  )
}
