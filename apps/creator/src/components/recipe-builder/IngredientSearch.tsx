'use client'

import { useState, useDeferredValue } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Input, Button } from '@ilaunchify/ui'
import { Search, Plus, Loader2 } from 'lucide-react'

interface IngredientSearchResult {
  id: string
  name: string
  category: string | null
  isOrganic: boolean
  allergens: string[]
  nutritionPer100g: Record<string, number>
}

interface IngredientSearchProps {
  alreadyAdded: string[]
  onAdd: (ing: IngredientSearchResult) => void
}

export function IngredientSearch({ alreadyAdded, onAdd }: IngredientSearchProps) {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)

  const { data, isFetching } = useQuery({
    queryKey: ['ingredients/search', deferredQuery],
    queryFn: async () => {
      if (deferredQuery.length < 2) return { ingredients: [] as IngredientSearchResult[] }
      const res = await fetch(`/api/ingredients/search?q=${encodeURIComponent(deferredQuery)}&limit=10`)
      if (!res.ok) throw new Error('Search failed')
      return (await res.json()) as { ingredients: IngredientSearchResult[] }
    },
    enabled: deferredQuery.length >= 2,
    staleTime: 15_000,
  })

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <Input
          className="pl-9"
          placeholder="Search ingredients (e.g. oats, almonds, whey)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {isFetching && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-zinc-400" />
        )}
      </div>

      {data && deferredQuery.length >= 2 && (
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-zinc-200 bg-zinc-50 p-1">
          {data.ingredients.length === 0 ? (
            <p className="px-3 py-2 text-sm text-zinc-500">No matches.</p>
          ) : (
            data.ingredients.map((ing) => {
              const added = alreadyAdded.includes(ing.id)
              return (
                <div
                  key={ing.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-white px-3 py-2 text-sm shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{ing.name}</div>
                    <div className="text-xs text-zinc-500">
                      {ing.category ?? '—'}
                      {ing.allergens.length > 0 && (
                        <span className="ml-2 text-amber-600">Allergens: {ing.allergens.join(', ')}</span>
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={added ? 'ghost' : 'outline'}
                    disabled={added}
                    onClick={() => {
                      onAdd(ing)
                      setQuery('')
                    }}
                  >
                    {added ? 'Added' : <><Plus className="mr-1 h-3 w-3" />Add</>}
                  </Button>
                </div>
              )
            })
          )}
        </div>
      )}

      {deferredQuery.length > 0 && deferredQuery.length < 2 && (
        <p className="text-xs text-zinc-500">Type at least 2 characters…</p>
      )}
    </div>
  )
}
