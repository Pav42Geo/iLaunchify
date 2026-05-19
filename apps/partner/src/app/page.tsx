import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { Factory, Printer, PackageCheck } from 'lucide-react'

export default function PartnersIndex() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <header className="mb-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight">Partner with iLaunchify</h1>
        <p className="mt-4 text-lg text-zinc-600">
          We connect emerging creators with vetted US manufacturers and print providers.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Link href="/partners/manufacturers">
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardHeader>
              <Factory className="mb-2 h-8 w-8 text-brand-primary" />
              <CardTitle>Manufacturers</CardTitle>
              <CardDescription>FDA/GMP-certified contract manufacturers</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-zinc-600">
              Fill excess capacity with recurring orders from our creator network.
            </CardContent>
          </Card>
        </Link>

        <Link href="/partners/print">
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardHeader>
              <Printer className="mb-2 h-8 w-8 text-brand-primary" />
              <CardTitle>Print providers</CardTitle>
              <CardDescription>Food-grade label and packaging print</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-zinc-600">
              CMYK-ready PDF workflows, dual-dispatch fulfillment built in.
            </CardContent>
          </Card>
        </Link>

        <Link href="/partners/copackers">
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardHeader>
              <PackageCheck className="mb-2 h-8 w-8 text-brand-primary" />
              <CardTitle>Co-packers</CardTitle>
              <CardDescription>Filling, labeling, kitting at low MOQ</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-zinc-600">
              List your services alongside manufacturing if you offer both.
            </CardContent>
          </Card>
        </Link>
      </div>

      <p className="mt-12 text-center text-sm text-zinc-500">
        Already a partner?{' '}
        <Link href="/login" className="underline">
          Sign in
        </Link>
      </p>
    </main>
  )
}
