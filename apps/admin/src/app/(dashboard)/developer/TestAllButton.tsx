'use client'

import { useState, useTransition } from 'react'
import { Activity, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { testAllIntegrations, type BatchTestResult } from './actions'
import { summarizeTestResults } from './test-summary'

export function TestAllButton() {
  const [results, setResults] = useState<BatchTestResult[] | null>(null)
  const [pending, start] = useTransition()

  function run() {
    setResults(null)
    start(async () => {
      setResults(await testAllIntegrations())
    })
  }

  const summary = results
    ? summarizeTestResults(results.map((r) => ({ key: r.key, name: r.name, ok: r.result.ok })))
    : null

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
          Test all connections
        </button>
        {summary && (
          <span
            className={`text-[12px] font-semibold ${summary.allPassed ? 'text-success-700' : 'text-danger-700'}`}
          >
            {summary.passed}/{summary.total} connected
            {summary.failed > 0 && ` · ${summary.failedNames.join(', ')} failed`}
          </span>
        )}
      </div>

      {results && results.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {results.map((r) => (
            <li key={r.key} className="inline-flex items-center gap-1 text-[11.5px]">
              {r.result.ok ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-success-600" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-danger-600" />
              )}
              <span className="font-medium text-ink-700">{r.name}</span>
              <span className="text-ink-400">
                {r.result.message}
                {r.result.latencyMs != null && ` · ${r.result.latencyMs}ms`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
