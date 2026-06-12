// Curated AAFCO pet-ingredient dictionary (Phase 3). AAFCO ingredient definitions
// have no free public API, so V1 ships a curated list of common pet-food
// ingredients by category — matching how the admin "AAFCO" data source is modeled
// as MIRROR (local). Picking one fills the ingredient name; the manufacturer sets
// the relative weight. Extendable. docs/PRODUCT_DOMAINS_ARCHITECTURE.md (Phase 3).

export interface AafcoEntry {
  name: string
  category: string // display only
}

export const AAFCO_DICTIONARY: AafcoEntry[] = [
  // Animal proteins
  { name: 'Chicken', category: 'Animal protein' },
  { name: 'Chicken Meal', category: 'Animal protein (rendered)' },
  { name: 'Deboned Chicken', category: 'Animal protein' },
  { name: 'Turkey', category: 'Animal protein' },
  { name: 'Turkey Meal', category: 'Animal protein (rendered)' },
  { name: 'Beef', category: 'Animal protein' },
  { name: 'Beef Meal', category: 'Animal protein (rendered)' },
  { name: 'Lamb', category: 'Animal protein' },
  { name: 'Lamb Meal', category: 'Animal protein (rendered)' },
  { name: 'Salmon', category: 'Animal protein (fish)' },
  { name: 'Salmon Meal', category: 'Animal protein (fish, rendered)' },
  { name: 'Whitefish', category: 'Animal protein (fish)' },
  { name: 'Fish Meal', category: 'Animal protein (fish, rendered)' },
  { name: 'Duck', category: 'Animal protein' },
  { name: 'Venison', category: 'Animal protein' },
  { name: 'Egg', category: 'Animal protein' },
  { name: 'Dried Egg Product', category: 'Animal protein' },
  { name: 'Chicken Liver', category: 'Organ / palatant' },
  { name: 'Chicken By-Product Meal', category: 'Animal protein (rendered)' },
  // Plant proteins
  { name: 'Pea Protein', category: 'Plant protein' },
  { name: 'Soybean Meal', category: 'Plant protein' },
  { name: 'Corn Gluten Meal', category: 'Plant protein' },
  { name: 'Potato Protein', category: 'Plant protein' },
  // Grains / carbohydrates
  { name: 'Brown Rice', category: 'Grain / carbohydrate' },
  { name: 'Brewers Rice', category: 'Grain / carbohydrate' },
  { name: 'White Rice', category: 'Grain / carbohydrate' },
  { name: 'Oatmeal', category: 'Grain / carbohydrate' },
  { name: 'Barley', category: 'Grain / carbohydrate' },
  { name: 'Ground Corn', category: 'Grain / carbohydrate' },
  { name: 'Wheat', category: 'Grain / carbohydrate' },
  { name: 'Sorghum', category: 'Grain / carbohydrate' },
  { name: 'Sweet Potato', category: 'Carbohydrate (grain-free)' },
  { name: 'Potato', category: 'Carbohydrate (grain-free)' },
  { name: 'Peas', category: 'Carbohydrate / legume' },
  { name: 'Lentils', category: 'Carbohydrate / legume' },
  { name: 'Chickpeas (Garbanzo Beans)', category: 'Carbohydrate / legume' },
  { name: 'Tapioca', category: 'Carbohydrate (grain-free)' },
  // Fats / oils
  { name: 'Chicken Fat', category: 'Fat / oil' },
  { name: 'Fish Oil', category: 'Fat / oil (omega-3)' },
  { name: 'Salmon Oil', category: 'Fat / oil (omega-3)' },
  { name: 'Flaxseed', category: 'Fat / fiber (omega-3)' },
  { name: 'Sunflower Oil', category: 'Fat / oil' },
  { name: 'Canola Oil', category: 'Fat / oil' },
  // Fibers / functional
  { name: 'Beet Pulp', category: 'Fiber' },
  { name: 'Powdered Cellulose', category: 'Fiber' },
  { name: 'Pumpkin', category: 'Fiber' },
  { name: 'Chicory Root', category: 'Prebiotic fiber' },
  { name: 'Dried Chicory Root (Inulin)', category: 'Prebiotic fiber' },
  // Supplements / actives
  { name: 'Taurine', category: 'Amino acid (required for cats)' },
  { name: 'L-Carnitine', category: 'Supplement' },
  { name: 'DL-Methionine', category: 'Amino acid' },
  { name: 'Glucosamine Hydrochloride', category: 'Joint supplement' },
  { name: 'Chondroitin Sulfate', category: 'Joint supplement' },
  { name: 'Dried Lactobacillus acidophilus Fermentation Product', category: 'Probiotic' },
  { name: 'Yucca Schidigera Extract', category: 'Functional' },
  // Vitamins / minerals (common premix members)
  { name: 'Vitamin E Supplement', category: 'Vitamin' },
  { name: 'Vitamin A Supplement', category: 'Vitamin' },
  { name: 'Vitamin D3 Supplement', category: 'Vitamin' },
  { name: 'Thiamine Mononitrate', category: 'Vitamin (B1)' },
  { name: 'Riboflavin Supplement', category: 'Vitamin (B2)' },
  { name: 'Zinc Sulfate', category: 'Mineral' },
  { name: 'Zinc Proteinate', category: 'Mineral (chelated)' },
  { name: 'Iron Proteinate', category: 'Mineral (chelated)' },
  { name: 'Copper Sulfate', category: 'Mineral' },
  { name: 'Calcium Carbonate', category: 'Mineral' },
  { name: 'Dicalcium Phosphate', category: 'Mineral' },
  { name: 'Sodium Chloride (Salt)', category: 'Mineral' },
  { name: 'Potassium Chloride', category: 'Mineral' },
  // Preservatives
  { name: 'Mixed Tocopherols', category: 'Preservative (natural)' },
  { name: 'Rosemary Extract', category: 'Preservative (natural)' },
  { name: 'Citric Acid', category: 'Preservative' },
]

/** Search the curated AAFCO dictionary (exact/prefix first). */
export function searchAafco(query: string, limit = 12): AafcoEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hits = AAFCO_DICTIONARY.filter((e) => e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q))
  return hits
    .sort((a, b) => rank(a.name.toLowerCase(), q) - rank(b.name.toLowerCase(), q))
    .slice(0, limit)
}
function rank(name: string, q: string): number {
  if (name === q) return 0
  if (name.startsWith(q)) return 1
  return 2
}
