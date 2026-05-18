'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@ilaunchify/ui'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import type { ComplianceResult } from '@ilaunchify/types'
import { useRecipeBuilderStore, type BuilderIngredient } from '@/stores/recipe-builder-store'
import { IngredientSearch } from './IngredientSearch'
import { IngredientRow } from './IngredientRow'
import { NutritionPreview } from './NutritionPreview'
import { ComplianceResultPanel } from './ComplianceResultPanel'
import { saveRecipe } from './actions'

type Category = 'FOOD' | 'BEVERAGE_FUNCTIONAL' | 'SUPPLEMENT'

interface RecipeBuilderProps {
  productId: string
  productCategory: Category
  initial: {
    recipeId: string
    servingSizeG: number
    servingsPerContainer: number
    servingSizeDesc: string
    ingredients: BuilderIngredient[]
  }
}

export function RecipeBuilder({ productId, productCategory, initial }: RecipeBuilderProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [compliance, setCompliance] = useState<ComplianceResult | null>(null)
  const [complianceError, setComplianceError] = useState<string | undefined>(undefined)

  const {
    servingSizeG,
    servingsPerContainer,
    servingSizeDesc,
    ingredients,
    setRecipe,
    setServingSize,
    setServingsPerContainer,
    addIngredient,
    removeIngredient,
    updateIngredientWeight,
  } = useRecipeBuilderStore()

  // Hydrate store on mount + on initial prop changes
  useEffect(() => {
    setRecipe(initial)
  }, [initial, setRecipe])

  const totalRecipeWeightG = useMemo(
    () => ingredients.reduce((sum, i) => sum + i.weightG, 0),
    [ingredients],
  )

  async function handleSave() {
    if (ingredients.length === 0) {
      toast.error('Add at least one ingredient before saving')
      return
    }
    if (servingSizeG <= 0) {
      toast.error('Set a serving size')
      return
    }

    setSaving(true)
    try {
      const result = await saveRecipe({
        recipeId: initial.recipeId,
        servingSizeG,
        servingsPerContainer,
        servingSizeDesc,
        ingredients: ingredients.map((i) => ({
          ingredientId: i.ingredientId,
          weightG: i.weightG,
          position: i.position,
        })),
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setCompliance(result.compliance)
      setComplianceError(result.complianceError)
      if (result.complianceError) {
        toast.warning('Recipe saved — compliance check failed')
      } else if (result.compliance?.outcome === 'FAILED') {
        toast.error(`Recipe saved — ${result.compliance.violations.length} blocking violation(s)`)
      } else if (result.compliance?.outcome === 'PASSED_WITH_WARNINGS') {
        toast.warning('Recipe saved — passed with warnings')
      } else {
        toast.success('Recipe saved — compliant')
      }
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  async function handleContinue() {
    await handleSave()
    // Block if last check returned violations
    if (compliance?.outcome === 'FAILED') {
      toast.error('Resolve blocking violations before continuing to label design')
      return
    }
    router.push(`/products/${productId}/label`)
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr,360px]">
      {/* Left column — recipe editor */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Serving</CardTitle>
            <CardDescription>FDA-required fields for the panel.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="servingSizeG">Serving size (g)</Label>
              <Input
                id="servingSizeG"
                type="number"
                step="0.1"
                min="0"
                value={servingSizeG || ''}
                onChange={(e) => setServingSize(Number(e.target.value))}
                placeholder="30"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="servingsPerContainer">Servings / container</Label>
              <Input
                id="servingsPerContainer"
                type="number"
                step="1"
                min="1"
                value={servingsPerContainer || ''}
                onChange={(e) => setServingsPerContainer(Number(e.target.value))}
                placeholder="30"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="servingSizeDesc">Description</Label>
              <Input
                id="servingSizeDesc"
                value={servingSizeDesc}
                onChange={(e) => setServingSize(servingSizeG, e.target.value)}
                placeholder="1 scoop (30g)"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ingredients</CardTitle>
            <CardDescription>
              Added in descending order of weight on the published label. Total recipe weight:{' '}
              <span className="font-semibold">{totalRecipeWeightG.toFixed(1)} g</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {ingredients.length > 0 && (
              <div className="space-y-2">
                {ingredients
                  .slice()
                  .sort((a, b) => b.weightG - a.weightG)
                  .map((ing) => (
                    <IngredientRow
                      key={ing.id}
                      ingredient={ing}
                      onWeightChange={(w) => updateIngredientWeight(ing.id, w)}
                      onRemove={() => removeIngredient(ing.id)}
                    />
                  ))}
              </div>
            )}

            <IngredientSearch
              alreadyAdded={ingredients.map((i) => i.ingredientId)}
              onAdd={(ing) =>
                addIngredient({
                  id: `tmp_${crypto.randomUUID()}`,
                  ingredientId: ing.id,
                  name: ing.name,
                  weightG: 0,
                  nutritionPer100g: ing.nutritionPer100g,
                })
              }
            />
          </CardContent>
        </Card>

        <div className="flex justify-between gap-2">
          <Button variant="ghost" onClick={() => router.push(`/products/${productId}`)}>
            Back
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSave} disabled={saving}>
              <Save className="mr-1 h-4 w-4" />
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button onClick={handleContinue} disabled={saving}>
              Continue to label
            </Button>
          </div>
        </div>
      </div>

      {/* Right column — live nutrition preview + compliance result */}
      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <NutritionPreview
          ingredients={ingredients}
          servingSizeG={servingSizeG}
          servingsPerContainer={servingsPerContainer}
          servingSizeDesc={servingSizeDesc || `${servingSizeG} g`}
          productCategory={productCategory}
        />
        {(compliance || complianceError) && (
          <ComplianceResultPanel result={compliance} errorMessage={complianceError} />
        )}
      </div>
    </div>
  )
}
