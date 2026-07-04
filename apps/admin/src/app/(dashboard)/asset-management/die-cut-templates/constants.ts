// Die-cut Templates — shared category list (no prisma/server imports so the client can
// import it too). Mirrors the DieCutCategory enum in packages/db/prisma/schema.prisma;
// keep in sync if the enum changes. Grouped for the filter UI.

export const DIE_CUT_CATEGORY_GROUPS: { label: string; values: string[] }[] = [
  { label: 'Labels & wraps', values: ['BOTTLE_WRAP', 'CAN_WRAP', 'JAR_WRAP', 'WRAP_AROUND_LABEL', 'FRONT_BACK_LABEL', 'SHRINK_SLEEVE', 'NECK_LABEL', 'LID_LABEL', 'TUB_LID', 'STICKER', 'HANG_TAG'] },
  { label: 'Folding cartons', values: ['STRAIGHT_TUCK_CARTON', 'REVERSE_TUCK_CARTON', 'SEAL_END_CARTON', 'AUTO_BOTTOM_CARTON', 'SNAP_LOCK_CARTON', 'GABLE_TOP_CARTON', 'FOLDING_TRAY', 'CARTON_SLEEVE', 'RIGID_BOX', 'MAILER_BOX', 'SHIPPER_CASE', 'BOX_PANEL'] },
  { label: 'Flexible', values: ['STAND_UP_POUCH', 'FLAT_POUCH', 'POUCH_FRONT', 'GUSSETED_BAG', 'SACHET', 'STICK_PACK', 'FLOW_WRAP', 'ROLLSTOCK'] },
  { label: 'Rigid & other', values: ['BLISTER_CARD', 'CLAMSHELL', 'CUSTOM'] },
]

export const DIE_CUT_CATEGORIES: string[] = DIE_CUT_CATEGORY_GROUPS.flatMap((g) => g.values)

export const prettyCategory = (s: string): string =>
  s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
