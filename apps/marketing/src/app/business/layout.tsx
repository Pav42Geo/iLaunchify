/**
 * /business — Partner landing. The default surface is dark; child sections can
 * opt back into light via wrapper divs that set `data-surface="light"` or
 * `data-surface="cream"`.
 *
 * Since Next.js lets us emit raw HTML attributes only on `<html>` (root layout),
 * we use a `data-surface="dark"` wrapper here and let CSS scope tokens to it.
 */
export default function BusinessLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-surface="dark" className="bg-ink-900 text-white min-h-screen">
      {children}
    </div>
  )
}
