// 404 page for the creator app. A real not-found UI instead of Next's
// "missing required error components" loop.

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 py-16 text-center">
      <p className="font-display text-5xl font-bold text-ink-900">404</p>
      <h1 className="mt-3 max-w-xl font-display text-xl font-semibold text-ink-900">We couldn’t find that page.</h1>
      <p className="mt-2 max-w-md text-[14px] text-ink-500">The link may be broken or the page may have moved.</p>
      <div className="mt-6">
        <a
          href="/dashboard"
          className="rounded-full bg-ink-900 px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500"
        >
          Back to dashboard
        </a>
      </div>
    </div>
  )
}
