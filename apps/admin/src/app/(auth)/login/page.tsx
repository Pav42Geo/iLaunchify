import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { LoginForm } from './LoginForm'

export const metadata = { title: 'Sign in — Admin' }

export default async function LoginPage({
  searchParams,
}: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Admin access only.</CardDescription>
      </CardHeader>
      <CardContent>
        {error === 'unauthorized' && (
          <div className="mb-4 rounded-md bg-danger-50 p-3 text-sm text-danger-700">
            That account doesn&apos;t have admin access.
          </div>
        )}
        <LoginForm />
      </CardContent>
    </Card>
  )
}
