'use client'

import { Input, Button } from '@ilaunchify/ui'
import { Trash2 } from 'lucide-react'
import type { BuilderIngredient } from '@/stores/recipe-builder-store'

interface IngredientRowProps {
  ingredient: BuilderIngredient
  onWeightChange: (weightG: number) => void
  onRemove: () => void
}

export function IngredientRow({ ingredient, onWeightChange, onRemove }: IngredientRowProps) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-zinc-200 bg-white p-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{ingredient.name}</div>
      </div>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          step="0.01"
          min="0"
          value={ingredient.weightG || ''}
          onChange={(e) => onWeightChange(Number(e.target.value))}
          className="w-24 text-right"
          placeholder="0"
        />
        <span className="text-xs text-zinc-500">g</span>
      </div>
      <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label="Remove">
        <Trash2 className="h-4 w-4 text-zinc-400" />
      </Button>
    </div>
  )
}
