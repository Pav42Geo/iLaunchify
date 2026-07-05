// One-click unsubscribe — human landing page (checklist E,
// docs/EMAIL_NOTIFICATION_CENTER.md "One-click unsubscribe link").
//
// The email footer's "Unsubscribe" link points here with a signed token over
// (userId, category). No login required: the HMAC proves the link came from
// an email we sent to this user. Applying on GET is intentional and
// idempotent — the industry-standard footer-link behavior. Mail clients'
// automated one-click POST hits /unsubscribe/one-click instead (RFC 8058).

import { applyUnsubscribeToken } from '@ilaunchify/notifications'

export const dynamic = 'force-dynamic'

const REASON_COPY: Record<string, { title: string; body: string }> = {
  malformed: {
    title: 'This link looks broken',
    body: 'The unsubscribe link is incomplete. Try the link from the bottom of a recent email, or manage everything from your notification settings.',
  },
  'bad-signature': {
    title: 'This link looks broken',
    body: 'The unsubscribe link failed verification. Try the link from the bottom of a recent email, or manage everything from your notification settings.',
  },
  expired: {
    title: 'This link has expired',
    body: 'Unsubscribe links stay valid for 90 days. Open a newer email from us, or manage everything from your notification settings.',
  },
  'unknown-category': {
    title: 'This link looks broken',
    body: 'We couldn’t match this link to a notification group. Manage everything from your notification settings instead.',
  },
  'not-opt-outable': {
    title: 'These emails are required',
    body: 'This group covers account, billing, or order-outcome notices we’re required to send while you use iLaunchify, so it can’t be turned off.',
  },
  'persist-failed': {
    title: 'Something went wrong',
    body: 'We couldn’t save your preference just now. Please try the link again in a minute.',
  },
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const secret = process.env.NOTIFICATION_UNSUBSCRIBE_SECRET

  let title: string
  let body: string
  let ok = false

  if (!token || !secret) {
    title = 'This link looks broken'
    body =
      'The unsubscribe link is incomplete. Try the link from the bottom of a recent email, or manage everything from your notification settings.'
  } else {
    const result = await applyUnsubscribeToken(token, { secret })
    if (result.ok) {
      ok = true
      title = 'You’re unsubscribed'
      body = `You won’t get “${result.categoryLabel}” emails anymore. In-app notifications and required account emails are unaffected.`
    } else {
      const copy = REASON_COPY[result.reason] ?? REASON_COPY['malformed']!
      title = copy.title
      body = copy.body
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 px-4">
      <div className="w-full max-w-md rounded-3xl border border-ink-200 bg-white p-8 text-center shadow-sm">
        <div
          aria-hidden
          className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${
            ok ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-500'
          }`}
        >
          {ok ? '✓' : '!'}
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-ink-900">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-ink-600">{body}</p>
        <p className="mt-6 text-sm text-ink-500">
          Want finer control?{' '}
          <a
            href={process.env.NEXT_PUBLIC_CREATOR_URL
              ? `${process.env.NEXT_PUBLIC_CREATOR_URL}/settings/notifications`
              : 'http://localhost:3000/settings/notifications'}
            className="font-medium text-pink-700 underline underline-offset-2"
          >
            Manage notification preferences
          </a>
        </p>
      </div>
    </main>
  )
}
