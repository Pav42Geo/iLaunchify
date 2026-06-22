'use client'

import { useState, useTransition } from 'react'
import { Zap, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { testIntegration, type TestResult } from './actions'

export function TestConnectionButton({ integrationKey }: { integrationKey: string }) {
  const [result, setResult] = useState<TestResult | null>(null)
  const [pending, start] = useTransition()

  function run() {
    setResult(null)
    start(async () => {
      setResult(await testIntegration(integrationKey))
    })
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-full border border-ink-200 px-2.5 py-1 text-[11.5px] font-medium text-ink-700 hover:border-pink-300 hover:bg-pink-50 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
        Test connection
      </button>
      {result && (
        <span
          className={`inline-flex items-center gap-1 text-[11.5px] font-medium ${result.ok ? 'text-emerald-700' : 'text-rose-700'}`}
        >
          {result.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
          {result.message}
          {result.latencyMs != null && <span className="text-ink-400">· {result.latencyMs}ms</span>}
        </span>
      )}
    </span>
  )
}
