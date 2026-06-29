// PDP redesign — "iLaunchify Business" promo card. Sits below the configure
// box in zone 3. Dark ink-900 surface with the neon-green accent (allowed on
// dark surfaces only per the locked design system). Creator-voiced: aimed at
// someone launching a line, not a one-off.
//
// Server-renderable (no interactivity) — keep the server/client boundary clean.
// /business is a route within apps/marketing, so a plain in-app link works.

export function BusinessPromoCard() {
  return (
    <div className="mt-4 rounded-[var(--card-radius)] bg-[var(--ink-900)] p-4 text-white">
      <div className="flex items-center gap-2 font-display text-[16px] font-extrabold">
        <span className="h-2.5 w-2.5 rounded-full bg-[#B5FF3D]" aria-hidden="true" />
        iLaunchify Business
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-300">
        Launching a line, not a one-off? Get volume production rates, priority
        slots, and a dedicated partner who runs the operation with you.
      </p>
      <a
        href="/business"
        className="mt-3 inline-flex items-center rounded-pill bg-[#B5FF3D] px-3.5 py-1.5 text-[12.5px] font-semibold text-ink-900 transition-opacity hover:opacity-90"
      >
        Talk to our team →
      </a>
    </div>
  )
}
