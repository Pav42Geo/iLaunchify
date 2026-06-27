'use client'

import { useState, type ReactNode } from 'react'

/**
 * Photoreal-ready product slot. If `src` resolves to a real image it renders
 * that (the AI/photo render); if `src` is missing or 404s it gracefully falls
 * back to `children` (the on-brand vector pouch). Drop renders into
 * apps/marketing/public/proto/ and pass the path — no other change needed.
 */
export function ProductShot({
  src,
  alt = '',
  className,
  children,
}: {
  src?: string
  alt?: string
  className?: string
  children: ReactNode
}) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return <>{children}</>
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}
