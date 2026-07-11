'use client'

// Live pool bar (demo #livebar; Pavel 2026-07-10: "the pool should update
// like the Facebook feed"). Polls a cheap niche-scoped count every 30s; when
// new briefs land, shows "🟢 N new briefs — load" which refreshes the server
// component (full fit/exclusivity filters re-run there). No websockets infra
// needed; matched makers ALSO get a BRIEF_POSTED_MATCHED notification at post
// time, so the bell rings even when this page isn't open.

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { countNewPoolBriefs } from './actions'

const POLL_MS = 30_000

export function PoolLiveBar() {
  const router = useRouter()
  const [count, setCount] = React.useState(0)
  const sinceRef = React.useRef(new Date().toISOString())

  React.useEffect(() => {
    let alive = true
    const tick = async () => {
      try {
        const r = await countNewPoolBriefs(sinceRef.current)
        if (alive && r.ok) setCount(r.count)
      } catch {
        /* transient poll failures are fine */
      }
    }
    const id = setInterval(tick, POLL_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  if (count === 0) return null

  return (
    <button
      type="button"
      onClick={() => {
        sinceRef.current = new Date().toISOString()
        setCount(0)
        router.refresh()
      }}
      className="flex w-full items-center justify-center gap-s-2 rounded-pill border border-success-500 bg-success-50 px-s-4 py-s-2 text-ui-caption font-bold text-success-700 transition hover:bg-success-100"
    >
      🟢 {count} new brief{count === 1 ? '' : 's'} — load
    </button>
  )
}
