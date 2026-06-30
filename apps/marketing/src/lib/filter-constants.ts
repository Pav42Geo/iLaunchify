/**
 * Marketplace filter option constants — re-exported from @ilaunchify/types so
 * the marketing sidebar and the admin product editor share ONE slug source
 * (docs/MARKETPLACE_DESIGN.md §7). Import site kept stable for the marketing app.
 */
export {
  FORMAT_OPTIONS,
  MANUFACTURING_PROCESS_OPTIONS,
  ALLERGEN_FREE_OPTIONS,
  MARKET_FILTER_OPTIONS,
  LEAD_BUCKET_OPTIONS,
  MOQ_PRESET_OPTIONS,
  CONTAINER_CATEGORY_LABELS,
  formatLabel,
  leadLabel,
  formatOptionsForDomain,
  processOptionsForDomain,
} from '@ilaunchify/types'
export type { FilterOption as Option } from '@ilaunchify/types'
