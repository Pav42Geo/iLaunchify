import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { SignupForm } from './SignupForm'

export const metadata = { title: 'Start your creator account — iLaunchify' }

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; brandName?: string }>
}) {
  const { email, brandName } = await searchParams

  return (
    <div className="grid min-h-screen grid-cols-1 bg-zinc-50 md:grid-cols-2">
      {/* Left — marketing panel */}
      <aside className="hidden flex-col justify-between bg-zinc-900 p-12 text-zinc-100 md:flex">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-zinc-400">Create your brand</p>
          <h1 className="mt-4 text-4xl font-bold leading-tight">
            Bring your idea to shelves.
          </h1>
          <p className="mt-4 max-w-md text-zinc-300">
            Pick a product. Customize the recipe. Brand it. We&apos;ll match you with a
            verified manufacturer and handle production end-to-end.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 border-t border-zinc-800 pt-8">
          <Feature label="Product Builder" />
          <Feature label="Design Studio" />
          <Feature label="Verified Partners" />
        </div>
      </aside>

      {/* Right — signup form */}
      <main className="flex items-center justify-center p-6 md:p-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Start your creator account</CardTitle>
            <CardDescription>
              We&apos;ll send you a magic link to verify your email. Already have an account?{' '}
              <a href="/login" className="underline">
                Sign in
              </a>
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SignupForm prefillEmail={email} prefillBrand={brandName} />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

function Feature({ label }: { label: string }) {
  return (
    <div>
      <div className="h-1 w-8 rounded-full bg-emerald-400" />
      <p className="mt-2 text-sm font-medium text-zinc-200">{label}</p>
    </div>
  )
}
