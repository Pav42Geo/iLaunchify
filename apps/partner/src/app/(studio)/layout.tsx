// Full-screen Studio layout — no partner dashboard chrome. Mirrors the creator
// (studio) group so the die-line frame editor gets the whole viewport.

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 overflow-hidden bg-zinc-100">{children}</div>
}
