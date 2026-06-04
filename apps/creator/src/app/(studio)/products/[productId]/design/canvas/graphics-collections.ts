// Track D / D4 — curated CPG/supplement icon collections for the Graphics drawer.
//
// Hand-picked Iconify ids (all verified to resolve on api.iconify.design) so
// creators get relevant icons without searching blind. Grouped to mirror the
// marketplace niches (wellness / energy / gourmet / beauty / trust).

export interface IconCollection {
  label: string
  /** Full Iconify ids, "prefix:name". */
  icons: string[]
}

export const ICON_COLLECTIONS: IconCollection[] = [
  {
    label: 'Wellness & Natural',
    icons: [
      'mdi:leaf',
      'mdi:sprout',
      'mdi:flower',
      'mdi:pine-tree',
      'mdi:water',
      'lucide:leaf',
      'lucide:droplet',
      'tabler:plant-2',
      'mdi:meditation',
      'mdi:yoga',
    ],
  },
  {
    label: 'Energy & Performance',
    icons: [
      'mdi:lightning-bolt',
      'mdi:fire',
      'mdi:dumbbell',
      'mdi:run-fast',
      'mdi:heart-pulse',
      'lucide:zap',
      'lucide:flame',
      'tabler:bolt',
      'mdi:arm-flex',
      'mdi:battery-charging',
    ],
  },
  {
    label: 'Food & Gourmet',
    icons: [
      'mdi:food-apple',
      'mdi:fruit-cherries',
      'mdi:coffee',
      'mdi:cup-water',
      'mdi:cookie',
      'mdi:grain',
      'lucide:apple',
      'mdi:chef-hat',
      'mdi:silverware-fork-knife',
      'mdi:bottle-soda-classic',
    ],
  },
  {
    label: 'Beauty & Self-care',
    icons: [
      'mdi:spa',
      'lucide:sparkles',
      'mdi:flower-tulip',
      'mdi:face-woman-shimmer',
      'mdi:hand-heart',
      'mdi:lotion-plus',
    ],
  },
  {
    label: 'Trust & Quality',
    icons: [
      'mdi:shield-check',
      'mdi:check-decagram',
      'mdi:medal',
      'mdi:star',
      'mdi:certificate',
      'lucide:badge-check',
      'mdi:leaf-circle',
      'mdi:recycle',
    ],
  },
]
