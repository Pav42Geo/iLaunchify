// Curated INCI starter dictionary (Phase 2). INCI names are PCPC-licensed with no
// free public API, so V1 ships a curated list of common cosmetic ingredients with
// their function — the admin "INCI" data source is modeled as MIRROR (local) for
// exactly this reason. Picking one fills the ingredient's INCI name + flags color
// additives / fragrance automatically. Extendable; a fuller dictionary import is a
// later slice. docs/PRODUCT_DOMAINS_ARCHITECTURE.md (Phase 2).

export interface InciEntry {
  name: string // INCI name
  fn: string // primary function (display only)
  color?: boolean // color additive → declared last
  fragrance?: boolean // fragrance/flavor → may show as "Fragrance"
}

export const INCI_DICTIONARY: InciEntry[] = [
  // Solvents / base
  { name: 'Aqua (Water)', fn: 'Solvent' },
  { name: 'Alcohol Denat.', fn: 'Solvent / astringent' },
  { name: 'Propanediol', fn: 'Solvent / humectant' },
  { name: 'Pentylene Glycol', fn: 'Solvent / humectant' },
  // Humectants
  { name: 'Glycerin', fn: 'Humectant' },
  { name: 'Butylene Glycol', fn: 'Humectant / solvent' },
  { name: 'Propylene Glycol', fn: 'Humectant' },
  { name: 'Sodium Hyaluronate', fn: 'Humectant / active' },
  { name: 'Hyaluronic Acid', fn: 'Humectant / active' },
  { name: 'Sodium PCA', fn: 'Humectant' },
  { name: 'Panthenol', fn: 'Conditioning (pro-vitamin B5)' },
  { name: 'Urea', fn: 'Humectant' },
  // Emollients / oils
  { name: 'Caprylic/Capric Triglyceride', fn: 'Emollient' },
  { name: 'Squalane', fn: 'Emollient' },
  { name: 'Cetearyl Alcohol', fn: 'Emollient / emulsion stabilizer' },
  { name: 'Cetyl Alcohol', fn: 'Emollient / thickener' },
  { name: 'Stearyl Alcohol', fn: 'Emollient / thickener' },
  { name: 'Dimethicone', fn: 'Emollient (silicone)' },
  { name: 'Cyclopentasiloxane', fn: 'Emollient (silicone)' },
  { name: 'Isopropyl Myristate', fn: 'Emollient' },
  { name: 'Shea Butter (Butyrospermum Parkii Butter)', fn: 'Emollient' },
  { name: 'Jojoba Oil (Simmondsia Chinensis Seed Oil)', fn: 'Emollient' },
  { name: 'Coconut Oil (Cocos Nucifera Oil)', fn: 'Emollient' },
  { name: 'Sweet Almond Oil (Prunus Amygdalus Dulcis Oil)', fn: 'Emollient' },
  { name: 'Argan Oil (Argania Spinosa Kernel Oil)', fn: 'Emollient' },
  // Emulsifiers / surfactants
  { name: 'Glyceryl Stearate', fn: 'Emulsifier' },
  { name: 'Cetearyl Glucoside', fn: 'Emulsifier' },
  { name: 'Polysorbate 20', fn: 'Emulsifier / solubilizer' },
  { name: 'Polysorbate 60', fn: 'Emulsifier' },
  { name: 'Sodium Lauroyl Sarcosinate', fn: 'Surfactant (mild)' },
  { name: 'Sodium Lauryl Sulfate', fn: 'Surfactant (cleansing)' },
  { name: 'Sodium Laureth Sulfate', fn: 'Surfactant (cleansing)' },
  { name: 'Cocamidopropyl Betaine', fn: 'Surfactant (mild)' },
  { name: 'Decyl Glucoside', fn: 'Surfactant (mild)' },
  { name: 'Coco-Glucoside', fn: 'Surfactant (mild)' },
  // Actives
  { name: 'Niacinamide', fn: 'Active (vitamin B3)' },
  { name: 'Retinol', fn: 'Active (vitamin A)' },
  { name: 'Ascorbic Acid', fn: 'Active (vitamin C)' },
  { name: 'Tocopherol', fn: 'Antioxidant (vitamin E)' },
  { name: 'Salicylic Acid', fn: 'Active (BHA exfoliant)' },
  { name: 'Glycolic Acid', fn: 'Active (AHA exfoliant)' },
  { name: 'Lactic Acid', fn: 'Active (AHA) / pH adjuster' },
  { name: 'Allantoin', fn: 'Soothing' },
  { name: 'Bisabolol', fn: 'Soothing' },
  { name: 'Caffeine', fn: 'Active' },
  { name: 'Centella Asiatica Extract', fn: 'Soothing active' },
  { name: 'Aloe Barbadensis Leaf Juice', fn: 'Soothing' },
  { name: 'Zinc Oxide', fn: 'UV filter / colorant' },
  { name: 'Titanium Dioxide', fn: 'UV filter / colorant' },
  // Preservatives
  { name: 'Phenoxyethanol', fn: 'Preservative' },
  { name: 'Ethylhexylglycerin', fn: 'Preservative booster' },
  { name: 'Benzyl Alcohol', fn: 'Preservative' },
  { name: 'Sodium Benzoate', fn: 'Preservative' },
  { name: 'Potassium Sorbate', fn: 'Preservative' },
  { name: 'Caprylyl Glycol', fn: 'Preservative / humectant' },
  { name: 'Chlorphenesin', fn: 'Preservative' },
  // Thickeners / stabilizers / chelators / pH
  { name: 'Xanthan Gum', fn: 'Thickener' },
  { name: 'Carbomer', fn: 'Thickener' },
  { name: 'Sodium Polyacrylate', fn: 'Thickener' },
  { name: 'Hydroxyethylcellulose', fn: 'Thickener' },
  { name: 'Disodium EDTA', fn: 'Chelating agent' },
  { name: 'Citric Acid', fn: 'pH adjuster' },
  { name: 'Sodium Hydroxide', fn: 'pH adjuster' },
  { name: 'Triethanolamine', fn: 'pH adjuster' },
  // Fragrance / sensory
  { name: 'Parfum (Fragrance)', fn: 'Fragrance', fragrance: true },
  { name: 'Limonene', fn: 'Fragrance component' },
  { name: 'Linalool', fn: 'Fragrance component' },
  { name: 'Menthol', fn: 'Sensory / fragrance' },
  // Color additives
  { name: 'CI 77891 (Titanium Dioxide)', fn: 'Color additive (white)', color: true },
  { name: 'CI 77491 (Iron Oxides)', fn: 'Color additive (red)', color: true },
  { name: 'CI 77492 (Iron Oxides)', fn: 'Color additive (yellow)', color: true },
  { name: 'CI 77499 (Iron Oxides)', fn: 'Color additive (black)', color: true },
  { name: 'CI 19140 (Yellow 5)', fn: 'Color additive', color: true },
  { name: 'CI 42090 (Blue 1)', fn: 'Color additive', color: true },
  { name: 'Mica', fn: 'Colorant / texture', color: true },
]

/** Search the curated dictionary by name (exact/prefix first). */
export function searchInci(query: string, limit = 12): InciEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hits = INCI_DICTIONARY.filter((e) => e.name.toLowerCase().includes(q) || e.fn.toLowerCase().includes(q))
  return hits
    .sort((a, b) => rank(a.name.toLowerCase(), q) - rank(b.name.toLowerCase(), q))
    .slice(0, limit)
}
function rank(name: string, q: string): number {
  if (name === q) return 0
  if (name.startsWith(q)) return 1
  return 2
}
