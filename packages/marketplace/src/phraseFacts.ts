// @ilaunchify/marketplace — the canonical product-fact flag registry.
//
// These are the yes/no FACTS a manufacturer answers about a product in the
// partner "Label Phrases" card. They feed the PhraseRule engine (PRODUCT_FACT
// condition kind) so a handful of mandatory phrases that depend on
// claims/representation — and can't be inferred from ingredients — still
// trigger deterministically. The manufacturer answers facts they know; the
// platform applies the law.
//
// Stored on ProductTemplate.phraseFacts as { [key]: boolean }. Both the seed
// (packages/db) and the partner card (apps/partner) import this list so the
// flag keys never drift apart.

export interface PhraseFactFlag {
  key: string
  label: string
  help: string
  /** Labeling types the flag is relevant to (UI shows it only for these). */
  labelingTypes: string[]
}

export const PHRASE_FACT_FLAGS: PhraseFactFlag[] = [
  {
    key: 'makesStructureFunctionClaims',
    label: 'Makes structure/function claims',
    help: 'e.g. "supports immunity", "promotes focus" — triggers the DSHEA disclaimer.',
    labelingTypes: ['DIETARY_SUPPLEMENT'],
  },
  {
    key: 'tamperEvidentPackaging',
    label: 'Tamper-evident packaging',
    help: 'Sealed cap or band — triggers the tamper-evident seal notice.',
    labelingTypes: ['DIETARY_SUPPLEMENT', 'OTC', 'FOOD'],
  },
  {
    key: 'containsAspartame',
    label: 'Contains aspartame',
    help: 'Triggers the phenylketonurics / phenylalanine warning.',
    labelingTypes: ['FOOD', 'BEVERAGE', 'DIETARY_SUPPLEMENT'],
  },
  {
    key: 'isSelfPressurized',
    label: 'Self-pressurized / aerosol container',
    help: 'Triggers the aerosol "avoid spraying in eyes / contents under pressure" warning.',
    labelingTypes: ['FOOD', 'BEVERAGE', 'COSMETIC'],
  },
  {
    key: 'isSunscreen',
    label: 'Sunscreen / SPF product',
    help: 'Triggers the sunscreen Drug Facts statements (skin-cancer alert, uses).',
    labelingTypes: ['OTC'],
  },
  {
    key: 'isTopicalOtc',
    label: 'Topical / external-use OTC',
    help: 'Triggers "For external use only".',
    labelingTypes: ['OTC'],
  },
  {
    key: 'representedForWeightReduction',
    label: 'Represented for weight reduction',
    help: 'Triggers the very-low-calorie protein-diet warning.',
    labelingTypes: ['FOOD', 'BEVERAGE'],
  },
  {
    key: 'isJuiceBeverage',
    label: 'Juice or juice-flavored beverage',
    help: 'Beverage named/pictured with a fruit/vegetable — triggers the % juice declaration.',
    labelingTypes: ['BEVERAGE'],
  },
  {
    key: 'isUnpasteurizedJuice',
    label: 'Unpasteurized juice',
    help: 'Not processed to a 5-log pathogen reduction — triggers the unpasteurized-juice warning.',
    labelingTypes: ['BEVERAGE'],
  },
  {
    key: 'isImported',
    label: 'Imported product',
    help: 'Triggers country-of-origin marking.',
    labelingTypes: ['FOOD', 'BEVERAGE', 'DIETARY_SUPPLEMENT', 'COSMETIC'],
  },
  {
    key: 'claimsGlutenFreeWithWheat',
    label: 'Claims gluten-free AND contains processed wheat',
    help: 'Triggers the FDA "wheat processed to meet gluten-free requirements" statement.',
    labelingTypes: ['FOOD', 'BEVERAGE', 'DIETARY_SUPPLEMENT'],
  },
  {
    key: 'hasArtificialFlavor',
    label: 'Characterizing flavor is artificial',
    help: 'Triggers the "artificial / artificially flavored" declaration.',
    labelingTypes: ['FOOD', 'BEVERAGE'],
  },
  {
    key: 'hasChemicalPreservative',
    label: 'Contains a chemical preservative',
    help: 'Triggers the preservative name + function declaration.',
    labelingTypes: ['FOOD', 'BEVERAGE'],
  },
  {
    key: 'isAlcoholBeverage',
    label: 'Alcohol beverage (≥0.5% ABV)',
    help: 'Triggers the Government Warning + TTB declarations (alcohol content, class/type, bottler).',
    labelingTypes: ['BEVERAGE', 'FOOD'],
  },
  {
    key: 'isProfessionalUseOnly',
    label: 'Professional-use only (cosmetic)',
    help: 'Triggers the MoCRA professional-use statement.',
    labelingTypes: ['COSMETIC'],
  },
  {
    key: 'safetyNotSubstantiated',
    label: 'Safety not substantiated (cosmetic)',
    help: 'Triggers the "safety of this product has not been determined" warning.',
    labelingTypes: ['COSMETIC'],
  },
  {
    key: 'isSuntanningProduct',
    label: 'Suntanning product without sunscreen',
    help: 'Triggers the "does not contain a sunscreen" warning.',
    labelingTypes: ['COSMETIC'],
  },
  {
    key: 'isFeminineDeodorantSpray',
    label: 'Feminine deodorant spray',
    help: 'Triggers the 21 CFR 740.12 caution.',
    labelingTypes: ['COSMETIC'],
  },
  {
    key: 'isFoamingBath',
    label: 'Foaming detergent bath product',
    help: 'Triggers the 21 CFR 740.17 caution.',
    labelingTypes: ['COSMETIC'],
  },
  {
    key: 'isCoalTarHairDye',
    label: 'Coal-tar hair dye',
    help: 'Triggers the 21 CFR 740.18 warning + patch-test caution.',
    labelingTypes: ['COSMETIC'],
  },
  {
    key: 'isSupplementalPetFood',
    label: 'Pet food — NOT complete & balanced',
    help: 'Triggers "intended for intermittent or supplemental feeding only".',
    labelingTypes: ['PET_PRODUCT'],
  },
]

export const PHRASE_FACT_KEYS = PHRASE_FACT_FLAGS.map((f) => f.key)
