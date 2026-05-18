// Zustand store for the recipe builder's local UI state.
// Persisted across navigations within the builder via the recipeId key,
// but NOT a long-lived data store — saves to DB are explicit (server actions).

import { create } from 'zustand'

export interface BuilderIngredient {
  id: string                 // Recipe ingredient row id (cuid) — temporary for unsaved
  ingredientId: string       // FK to Ingredient table
  name: string               // Display only
  weightG: number
  nutritionPer100g: Record<string, number>
  position: number
  isDirty: boolean
}

interface RecipeBuilderState {
  recipeId: string | null
  servingSizeG: number
  servingsPerContainer: number
  servingSizeDesc: string
  ingredients: BuilderIngredient[]

  // Mutations
  setRecipe: (input: {
    recipeId: string
    servingSizeG: number
    servingsPerContainer: number
    servingSizeDesc: string
    ingredients: BuilderIngredient[]
  }) => void
  setServingSize: (g: number, desc?: string) => void
  setServingsPerContainer: (n: number) => void
  addIngredient: (ing: Omit<BuilderIngredient, 'position' | 'isDirty'>) => void
  removeIngredient: (id: string) => void
  updateIngredientWeight: (id: string, weightG: number) => void
  reset: () => void
}

export const useRecipeBuilderStore = create<RecipeBuilderState>((set) => ({
  recipeId: null,
  servingSizeG: 0,
  servingsPerContainer: 0,
  servingSizeDesc: '',
  ingredients: [],

  setRecipe: ({ recipeId, servingSizeG, servingsPerContainer, servingSizeDesc, ingredients }) =>
    set({ recipeId, servingSizeG, servingsPerContainer, servingSizeDesc, ingredients }),

  setServingSize: (g, desc) =>
    set((s) => ({ servingSizeG: g, servingSizeDesc: desc ?? s.servingSizeDesc })),

  setServingsPerContainer: (n) => set({ servingsPerContainer: n }),

  addIngredient: (ing) =>
    set((s) => ({
      ingredients: [...s.ingredients, { ...ing, position: s.ingredients.length, isDirty: true }],
    })),

  removeIngredient: (id) =>
    set((s) => ({
      ingredients: s.ingredients
        .filter((i) => i.id !== id)
        .map((i, idx) => ({ ...i, position: idx })),
    })),

  updateIngredientWeight: (id, weightG) =>
    set((s) => ({
      ingredients: s.ingredients.map((i) =>
        i.id === id ? { ...i, weightG, isDirty: true } : i,
      ),
    })),

  reset: () =>
    set({
      recipeId: null,
      servingSizeG: 0,
      servingsPerContainer: 0,
      servingSizeDesc: '',
      ingredients: [],
    }),
}))
