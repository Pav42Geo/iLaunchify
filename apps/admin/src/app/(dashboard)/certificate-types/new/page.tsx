// Admin — create a new CertificateType in the library.
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { CertificateTypeForm } from '../CertificateTypeForm'

export const metadata = { title: 'Add certificate type — iLaunchify Admin' }

export default function NewCertificateTypePage() {
  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/certificate-types"
          className="mb-2 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to library
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Add certificate type</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Save the type first, then upload its branded thumbnail on the edit page.
        </p>
      </header>
      <CertificateTypeForm mode="create" />
    </div>
  )
}
