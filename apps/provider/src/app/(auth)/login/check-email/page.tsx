import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ilaunchify/ui'

export default function CheckEmailPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Check your email</CardTitle>
        <CardDescription>We sent you a sign-in link.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-zinc-500">The link expires in 24 hours.</p>
      </CardContent>
    </Card>
  )
}
