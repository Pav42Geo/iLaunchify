// Substrate / material swatches for the die-line preview (Pavel 2026-06-23).
//
// Lets the admin/creator switch the preview surface to the appropriate material —
// kraft for a carton, white board for a folding box, clear film for a pouch, etc.
// Pure CSS backgrounds (no assets), reusable by the 2D preview now and the 3D
// mesh base colour later. `background` is a CSS `background` shorthand string.

export interface SubstrateSwatch {
  id: string
  label: string
  /** CSS `background` value applied to the preview surface. */
  background: string
  /** Small solid colour for the swatch chip + 3D base colour. */
  chip: string
  /** True for dark/metallic surfaces (the UI may flip stroke contrast). */
  dark?: boolean
}

export const SUBSTRATE_SWATCHES: SubstrateSwatch[] = [
  {
    id: 'white-board',
    label: 'White paperboard',
    chip: '#f6f4ee',
    background:
      'repeating-linear-gradient(0deg, rgba(0,0,0,0.012) 0 1px, transparent 1px 4px), #f6f4ee',
  },
  {
    id: 'coated-white',
    label: 'Coated white (gloss)',
    chip: '#ffffff',
    background: 'linear-gradient(135deg, #ffffff, #fbfbfc 60%, #f4f5f7)',
  },
  {
    id: 'uncoated',
    label: 'Uncoated natural',
    chip: '#efe9dd',
    background:
      'repeating-linear-gradient(45deg, rgba(120,90,50,0.04) 0 1px, transparent 1px 3px), #efe9dd',
  },
  {
    id: 'kraft',
    label: 'Kraft',
    chip: '#c8a16e',
    background:
      'repeating-linear-gradient(0deg, rgba(120,80,40,0.06) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(120,80,40,0.05) 0 1px, transparent 1px 3px), #c8a16e',
  },
  {
    id: 'corrugated',
    label: 'Corrugated kraft',
    chip: '#bb9560',
    background:
      'repeating-linear-gradient(90deg, #c8a16e 0 6px, #b9925c 6px 7px), #c8a16e',
  },
  {
    id: 'clear-film',
    label: 'Clear film',
    chip: '#e9e9ec',
    background: 'repeating-conic-gradient(#e9e9ec 0% 25%, #ffffff 0% 50%) 0 / 14px 14px',
  },
  {
    id: 'metallic',
    label: 'Metallic / foil',
    chip: '#cfd3d8',
    background: 'linear-gradient(135deg, #e9eaec, #c2c5ca 40%, #eef0f2 60%, #c8ccd1)',
    dark: false,
  },
]

const BY_ID = new Map(SUBSTRATE_SWATCHES.map((s) => [s.id, s]))
export function substrateById(id: string | null | undefined): SubstrateSwatch {
  return (id && BY_ID.get(id)) || SUBSTRATE_SWATCHES[0]!
}

/** Sensible default material for a canonical shape category. */
export function defaultSubstrateId(category?: string | null): string {
  switch ((category ?? '').toUpperCase()) {
    // Corrugated / heavy paperboard structures → kraft
    case 'BOX_PANEL':
    case 'MAILER_BOX':
    case 'SHIPPER_CASE':
    case 'GABLE_TOP_CARTON':
      return 'kraft'
    // Folding cartons + rigid boxes + applied labels → coated white board
    case 'TUB_LID':
    case 'LID_LABEL':
    case 'BOTTLE_WRAP':
    case 'CAN_WRAP':
    case 'JAR_WRAP':
    case 'WRAP_AROUND_LABEL':
    case 'FRONT_BACK_LABEL':
    case 'NECK_LABEL':
    case 'STRAIGHT_TUCK_CARTON':
    case 'REVERSE_TUCK_CARTON':
    case 'SEAL_END_CARTON':
    case 'AUTO_BOTTOM_CARTON':
    case 'SNAP_LOCK_CARTON':
    case 'FOLDING_TRAY':
    case 'CARTON_SLEEVE':
    case 'RIGID_BOX':
      return 'white-board'
    // Flexible films / sleeves → clear film
    case 'POUCH_FRONT':
    case 'STAND_UP_POUCH':
    case 'FLAT_POUCH':
    case 'GUSSETED_BAG':
    case 'SACHET':
    case 'STICK_PACK':
    case 'FLOW_WRAP':
    case 'ROLLSTOCK':
    case 'SHRINK_SLEEVE':
      return 'clear-film'
    // Adhesive labels / tags / cards → coated white
    case 'STICKER':
    case 'HANG_TAG':
    case 'BLISTER_CARD':
    case 'CLAMSHELL':
      return 'coated-white'
    default:
      return 'white-board'
  }
}
