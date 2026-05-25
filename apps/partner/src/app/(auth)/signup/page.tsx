import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { SignupForm } from './SignupForm'

export const metadata = { title: 'Apply to join the iLaunchify partner network' }

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; companyName?: string }>
}) {
  const { email, companyName } = await searchParams

  return (
    <div className="grid min-h-screen grid-cols-1 bg-zinc-50 md:grid-cols-2">
      {/* Left — marketing panel */}
      <aside className="hidden flex-col justify-between bg-emerald-900 p-12 text-emerald-50 md:flex">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-300">Partner network</p>
          <h1 className="mt-4 text-4xl font-bold leading-tight">
            Manufacture for the next generation of food + supplement brands.
          </h1>
          <p className="mt-4 max-w-md text-emerald-100">
            iLaunchify connects you to creators who need quality production. Bring your
            facility online, get matched with brand-ready orders, and skip the cold outreach.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 border-t border-emerald-800 pt-8">
          <Stat label="Active partners" value="500+" />
          <Stat label="States covered" value="48" />
          <Stat label="Avg. order match" value="< 7d" />
        </div>
      </aside>

      {/* Right — signup form */}
      <main className="flex items-center justify-center p-6 md:p-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Apply to join</CardTitle>
            <CardDescription>
              We&apos;ll send you a magic link to verify your email, then walk you through
              partner verification. Already have an account?{' '}
              <a href="/login" className="underline">
                Sign in
              </a>
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SignupForm prefillEmail={email} prefillCompany={companyName} />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-3xl font-bold text-white">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-wider text-emerald-200">{label}</p>
    </div>
  )
}
