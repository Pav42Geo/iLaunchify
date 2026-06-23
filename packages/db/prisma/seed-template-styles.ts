/**
 * Seed the Design Template Library style taxonomy (docs/DESIGN_TEMPLATE_LIBRARY.md §4).
 * ~26–30 styles per domain, clustered into four facets (AESTHETIC / POSITIONING /
 * AUDIENCE / TREND). Idempotent: upsert on (domain, slug). OTC rows seed active=false
 * — hidden until the OTC domain is enabled (DomainSetting).
 *
 * Run via `pnpm --filter @ilaunchify/db exec tsx prisma/seed-template-styles.ts`
 * (or wire into the main seed). Safe to re-run.
 */
import { PrismaClient } from '@prisma/client'

type Facet = 'AESTHETIC' | 'POSITIONING' | 'AUDIENCE' | 'TREND'
type Domain = 'COSMETIC' | 'FOOD' | 'DIETARY_SUPPLEMENT' | 'PET_PRODUCT' | 'OTC'

// [slug, label] per facet, per domain.
const TAXONOMY: Record<Domain, Record<Facet, [string, string][]>> = {
  COSMETIC: {
    AESTHETIC: [
      ['minimal-clean', 'Minimal / Clean'],
      ['clinical-derma', 'Clinical / Derma-Science'],
      ['luxury-premium', 'Luxury / Premium'],
      ['wellness-spa', 'Wellness & Spa'],
      ['natural-botanical', 'Natural / Botanical'],
      ['retro-vintage', 'Retro / Vintage'],
      ['bold-expressive', 'Bold / Expressive'],
      ['editorial-monochrome', 'Editorial / Monochrome'],
      ['apothecary-handcrafted', 'Apothecary / Handcrafted'],
      ['maximalist-pattern', 'Maximalist / Pattern'],
      ['y2k-hypercolor', 'Y2K / Hyper-color'],
      ['cottagecore-soft', 'Cottagecore / Soft'],
      ['gradient-aura', 'Gradient / Aura'],
      ['hand-drawn-illustrative', 'Hand-drawn / Illustrative'],
    ],
    POSITIONING: [
      ['medical-grade-dermatology', 'Medical-grade / Dermatology'],
      ['k-beauty', 'K-Beauty'],
      ['clean-beauty-nontoxic', 'Clean-beauty / Non-toxic'],
      ['vegan-cruelty-free', 'Vegan / Cruelty-free'],
      ['fragrance-perfume', 'Fragrance / Perfume'],
      ['mens-grooming', "Men's Grooming"],
      ['gender-neutral-unisex', 'Gender-neutral / Unisex'],
    ],
    AUDIENCE: [
      ['teen-gen-z', 'Teen / Gen-Z'],
      ['mature-anti-aging', 'Mature / Anti-aging'],
      ['baby-gentle', 'Baby / Gentle'],
    ],
    TREND: [
      ['eco-kraft-sustainable', 'Eco / Kraft-sustainable'],
      ['holiday-gift', 'Holiday / Gift'],
      ['summer-suncare', 'Summer / Suncare'],
      ['limited-edition', 'Limited-edition'],
      ['brutalist-industrial', 'Brutalist / Industrial'],
      ['pastel-calm', 'Pastel / Calm'],
    ],
  },
  FOOD: {
    AESTHETIC: [
      ['modern-minimal', 'Modern-Minimal'],
      ['bold-street', 'Bold / Street'],
      ['premium-gourmet', 'Premium / Gourmet'],
      ['heritage-craft', 'Heritage / Craft'],
      ['playful-fun', 'Playful / Fun'],
      ['farmhouse-rustic', 'Farmhouse / Rustic'],
      ['retro-diner', 'Retro / Diner'],
      ['hand-drawn-illustrative', 'Hand-drawn / Illustrative'],
      ['editorial-typographic', 'Editorial / Typographic'],
      ['maximalist-pattern', 'Maximalist / Pattern'],
      ['vibrant-pop', 'Vibrant / Pop'],
    ],
    POSITIONING: [
      ['better-for-you-clean-label', 'Better-for-you / Clean-label'],
      ['functional-performance', 'Functional / Performance'],
      ['keto-low-sugar', 'Keto / Low-sugar'],
      ['organic-natural', 'Organic / Natural'],
      ['artisanal-small-batch', 'Artisanal / Small-batch'],
      ['global-ethnic', 'Global / Ethnic-cuisine'],
      ['indulgent-dessert', 'Indulgent / Dessert'],
      ['plant-based-vegan', 'Plant-based / Vegan'],
      ['craft-soda-sparkling', 'Craft-soda / Sparkling'],
      ['coffee-tea', 'Coffee / Tea'],
      ['energy-hydration', 'Energy / Hydration'],
      ['cocktail-spirit-inspired', 'Cocktail / Spirit-inspired'],
    ],
    AUDIENCE: [
      ['kids-family', 'Kids / Family'],
      ['athletes-fitness', 'Athletes / Fitness'],
      ['premium-gifting', 'Premium-gifting'],
    ],
    TREND: [
      ['eco-sustainable', 'Eco / Sustainable'],
      ['seasonal-holiday', 'Seasonal / Holiday'],
      ['nostalgic-vintage-revival', 'Nostalgic / Vintage-revival'],
    ],
  },
  DIETARY_SUPPLEMENT: {
    AESTHETIC: [
      ['clinical-pharma', 'Clinical / Pharma'],
      ['minimal-clean', 'Minimal / Clean'],
      ['bold-sports', 'Bold / Sports'],
      ['wellness-lifestyle', 'Wellness / Lifestyle'],
      ['natural-herbal', 'Natural / Herbal'],
      ['luxury-longevity', 'Luxury / Longevity'],
      ['editorial-science', 'Editorial / Science'],
      ['pastel-calm', 'Pastel / Calm'],
      ['dark-premium-black', 'Dark / Premium-black'],
      ['vibrant-energy', 'Vibrant / Energy'],
    ],
    POSITIONING: [
      ['sports-performance', 'Sports-performance'],
      ['womens-wellness', "Women's-wellness"],
      ['mens-health', "Men's-health"],
      ['beauty-from-within', 'Beauty-from-within'],
      ['gut-probiotic', 'Gut / Probiotic'],
      ['cognitive-nootropic', 'Cognitive / Nootropic'],
      ['sleep-recovery', 'Sleep / Recovery'],
      ['immunity', 'Immunity'],
      ['vegan-plant-based', 'Vegan / Plant-based'],
      ['kids-gummies', 'Kids / Gummies'],
    ],
    AUDIENCE: [
      ['senior-55-plus', 'Senior / 55+'],
      ['athlete', 'Athlete'],
      ['everyday-wellness', 'Everyday-wellness'],
    ],
    TREND: [
      ['eco-sustainable', 'Eco / Sustainable'],
      ['clean-label-transparent', 'Clean-label / Transparent'],
      ['apothecary-botanical-modern', 'Apothecary / Botanical-modern'],
      ['molecular-pattern', 'Molecular / Pattern'],
    ],
  },
  PET_PRODUCT: {
    AESTHETIC: [
      ['premium-human-grade', 'Premium / Human-grade'],
      ['natural-raw', 'Natural / Raw'],
      ['veterinary-clinical', 'Veterinary / Clinical'],
      ['playful-fun', 'Playful / Fun'],
      ['farmhouse-heritage', 'Farmhouse / Heritage'],
      ['modern-minimal', 'Modern-Minimal'],
      ['bold-vibrant', 'Bold / Vibrant'],
      ['hand-drawn-illustrative', 'Hand-drawn / Illustrative'],
      ['editorial-typographic', 'Editorial / Typographic'],
      ['luxury-boutique', 'Luxury / Boutique'],
    ],
    POSITIONING: [
      ['grain-free-limited-ingredient', 'Grain-free / Limited-ingredient'],
      ['fresh-refrigerated', 'Fresh / Refrigerated'],
      ['functional-health', 'Functional / Health'],
      ['treat-indulgent', 'Treat / Indulgent'],
      ['breed-specific', 'Breed-specific'],
      ['life-stage', 'Life-stage (puppy / senior)'],
      ['vet-recommended-rx', 'Vet-recommended / Rx'],
      ['sustainable-eco', 'Sustainable / Eco'],
    ],
    AUDIENCE: [
      ['dog', 'Dog'],
      ['cat', 'Cat'],
      ['small-pet-exotic', 'Small-pet / Exotic'],
    ],
    TREND: [
      ['eco-kraft', 'Eco / Kraft'],
      ['holiday-gift', 'Holiday / Gift'],
      ['subscription-dtc-modern', 'Subscription / DTC-modern'],
    ],
  },
  // OTC — seeded active=false; hidden until DomainSetting(OTC) is enabled.
  OTC: {
    AESTHETIC: [
      ['clinical-pharma', 'Clinical / Pharma'],
      ['trust-blue-white', 'Trust-blue / White'],
      ['modern-dtc', 'Modern-DTC'],
      ['minimal-clean', 'Minimal / Clean'],
      ['premium-pharmacy-brand', 'Premium / Pharmacy-brand'],
      ['value-generic', 'Value / Generic'],
      ['trust-authority', 'Trust / Authority'],
    ],
    POSITIONING: [
      ['pediatric-family', 'Pediatric / Family'],
      ['natural-otc', 'Natural-OTC'],
      ['pain-relief-bold', 'Pain-relief / Bold'],
      ['cold-flu-seasonal', 'Cold & Flu / Seasonal'],
      ['digestive', 'Digestive'],
      ['allergy', 'Allergy'],
      ['first-aid', 'First-aid'],
      ['sleep-aid', 'Sleep-aid'],
      ['homeopathic-natural', 'Homeopathic / Natural'],
      ['topical-derm', 'Topical / Derm'],
      ['eye-ear-care', 'Eye & Ear care'],
      ['vitamin-adjacent', 'Vitamin-adjacent'],
    ],
    AUDIENCE: [['senior-large-type', 'Senior / Large-type']],
    TREND: [],
  },
}

/** Upsert the whole taxonomy. Idempotent; re-running updates labels/order/active. */
export async function seedTemplateStyles(prisma: PrismaClient) {
  const facets: Facet[] = ['AESTHETIC', 'POSITIONING', 'AUDIENCE', 'TREND']
  const styleDelegate = (prisma as unknown as {
    templateStyle?: {
      upsert: (a: unknown) => Promise<unknown>
    }
  }).templateStyle
  if (!styleDelegate) {
    throw new Error(
      'TemplateStyle model not found on the Prisma client. Run the schema push + client ' +
        'regen FIRST, then re-run this seed:\n' +
        '  pnpm --filter @ilaunchify/db db:push\n' +
        '  pnpm --filter @ilaunchify/db db:generate\n' +
        '  pnpm --filter @ilaunchify/db seed:template-styles',
    )
  }
  let total = 0
  for (const domain of Object.keys(TAXONOMY) as Domain[]) {
    const active = domain !== 'OTC'
    let sort = 0
    for (const facet of facets) {
      for (const [slug, label] of TAXONOMY[domain][facet]) {
        await styleDelegate.upsert({
          where: { domain_slug: { domain, slug } },
          create: { domain, facet, slug, label, sortOrder: sort, active },
          update: { facet, label, sortOrder: sort, active },
        })
        sort += 1
        total += 1
      }
    }
    const count = facets.reduce((n, f) => n + TAXONOMY[domain][f].length, 0)
    console.log(`  template styles · ${domain}: ${count}${active ? '' : ' (inactive)'}`)
  }
  console.log(`✓ Seeded ${total} template styles across ${Object.keys(TAXONOMY).length} domains.`)
}

// Standalone runner: `pnpm --filter @ilaunchify/db seed:template-styles`
if (process.argv[1] && process.argv[1].endsWith('seed-template-styles.ts')) {
  const prisma = new PrismaClient()
  seedTemplateStyles(prisma)
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
    .finally(() => void prisma.$disconnect())
}
