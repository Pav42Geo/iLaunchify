import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'
import { LoginForm } from './LoginForm'

export const metadata = { title: 'Sign in — Admin' }

export default function LoginPage({
  searchParams,
}: { searchParams: { error?: string } }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Admin access only.</CardDescription>
      </CardHeader>
      <CardContent>
        {searchParams.error === 'unauthorized' && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            That account doesn&apos;t have admin access.
          </div>
        )}
        <LoginForm />
      </CardContent>
    </Card>
  )
}
