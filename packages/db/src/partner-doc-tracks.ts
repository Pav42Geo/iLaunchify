// Role-specific onboarding document tracks — Partner Role Accounts P0
// (docs/PARTNER_ROLE_ACCOUNTS.md §4.1, LOCKED 2026-07-02).
//
// One matrix, consumed by BOTH apps:
//   * apps/partner  → /onboarding/documents renders the checklist for the
//     partner's chosen service types (upload slots + expiry capture)
//   * apps/admin    → partner verification (DOCUMENTS section) renders the
//     same track as a required-vs-uploaded review checklist
//
// Requirement levels:
//   REQUIRED     — gates the capability listed in `gates`
//   CONDITIONAL  — required only when `conditionNote` applies (admin judges
//                  in review; the partner sees the note and self-assesses)
//   OPTIONAL     — helpful, never gating
//
// `expiring: true` documents capture an expiry date at upload and feed the
// Expiry Engine (partner-ops cron: 60/30/7 reminders + DOC_EXPIRED on lapse).
//
// Pure module — no prisma import; PartnerFileKind / VerificationSectionType /
// ServiceType stay as string literals so this is safe in client bundles.

export type DocRequirementLevel = 'REQUIRED' | 'CONDITIONAL' | 'OPTIONAL'

export interface DocRequirement {
  /** Stable key — never rename (referenced from review payloads). */
  key: string
  label: string
  description: string
  /** PartnerFileKind the upload lands under. */
  kind: string
  /** VerificationSectionType the file (and its review) belongs to. */
  sectionType: string
  requirement: DocRequirementLevel
  /** Shown when CONDITIONAL — the partner self-assesses, the admin judges. */
  conditionNote?: string
  /** Capture expiresAt at upload; swept by the Expiry Engine. */
  expiring: boolean
  /** ServiceTypes this requirement applies to (empty = every partner). */
  appliesTo: string[]
}

const PRODUCING = ['MANUFACTURING', 'COPACKING']

/** The full §4.1 matrix. Filter with docTrackFor() — don't consume raw. */
export const PARTNER_DOC_TRACK: DocRequirement[] = [
  // ---- Every partner --------------------------------------------------------
  {
    key: 'cert-of-incorporation',
    label: 'Certificate of incorporation',
    description: 'Articles of incorporation or business registration document.',
    kind: 'CERT_OF_INCORPORATION',
    sectionType: 'BUSINESS',
    requirement: 'REQUIRED',
    expiring: false,
    appliesTo: [],
  },
  {
    key: 'business-license',
    label: 'Business license',
    description: 'State / county business license.',
    kind: 'BUSINESS_LICENSE',
    sectionType: 'BUSINESS',
    requirement: 'REQUIRED',
    expiring: true,
    appliesTo: [],
  },
  {
    key: 'coi',
    label: 'General liability insurance (COI)',
    description: 'Current COI showing $1M+ general liability coverage. Include the expiry date — we remind you before it lapses.',
    kind: 'INSURANCE',
    sectionType: 'DOCUMENTS',
    requirement: 'REQUIRED',
    expiring: true,
    appliesTo: [],
  },
  {
    key: 'facility-photos',
    label: 'Facility photos',
    description: 'Production floor, packaging area, storage. 3–6 photos.',
    kind: 'FACILITY_PHOTO',
    sectionType: 'FACILITY',
    requirement: 'OPTIONAL',
    expiring: false,
    appliesTo: [],
  },
  {
    key: 'logo',
    label: 'Company logo',
    description: 'PNG with transparent background preferred. Used on your public partner page.',
    kind: 'LOGO',
    sectionType: 'PUBLIC_PROFILE',
    requirement: 'OPTIONAL',
    expiring: false,
    appliesTo: [],
  },
  // ---- Producing roles (manufacturer + co-packer) ---------------------------
  {
    key: 'fda-registration',
    label: 'FDA facility registration',
    description: 'FDA food-facility registration (registration number visible).',
    kind: 'CERTIFICATE',
    sectionType: 'DOCUMENTS',
    requirement: 'REQUIRED',
    expiring: true,
    appliesTo: PRODUCING,
  },
  {
    key: 'gfsi-gmp',
    label: 'GFSI certificate or GMP audit report',
    description: 'SQF / BRC / FSSC 22000 certificate, or your most recent third-party cGMP audit report.',
    kind: 'CERTIFICATE',
    sectionType: 'DOCUMENTS',
    requirement: 'REQUIRED',
    expiring: true,
    appliesTo: PRODUCING,
  },
  {
    key: 'haccp-recall',
    label: 'HACCP / allergen program / recall SOP',
    description: 'Your food-safety plan: HACCP or preventive controls, allergen program, and recall / traceability SOP (one PDF is fine).',
    kind: 'CERTIFICATE',
    sectionType: 'DOCUMENTS',
    requirement: 'REQUIRED',
    expiring: false,
    appliesTo: PRODUCING,
  },
  {
    key: 'claim-certs',
    label: 'Organic / Kosher / Halal certificates',
    description: 'Only if you produce under these claims — upload each active certificate.',
    kind: 'CERTIFICATE',
    sectionType: 'DOCUMENTS',
    requirement: 'CONDITIONAL',
    conditionNote: 'Required only if you produce under Organic, Kosher, or Halal claims.',
    expiring: true,
    appliesTo: PRODUCING,
  },
  // ---- Print providers -------------------------------------------------------
  {
    key: 'food-contact-attestation-print',
    label: 'Food-contact materials attestation',
    description: 'Attestation that inks / substrates used for food-contact packaging meet FDA food-contact requirements.',
    kind: 'CERTIFICATE',
    sectionType: 'DOCUMENTS',
    requirement: 'CONDITIONAL',
    conditionNote: 'Required only if you print primary (food-contact) packaging.',
    expiring: false,
    appliesTo: ['LABEL_PRINTING'],
  },
  // ---- Fulfillment Centers (WAREHOUSE) ---------------------------------------
  {
    key: 'fc-food-registration',
    label: 'FDA facility registration (food storage)',
    description: 'FDA registration for facilities holding food for distribution.',
    kind: 'CERTIFICATE',
    sectionType: 'DOCUMENTS',
    requirement: 'CONDITIONAL',
    conditionNote: 'Required if your facility stores food or supplement products.',
    expiring: true,
    appliesTo: ['WAREHOUSE'],
  },
  {
    key: 'fc-food-grade',
    label: 'Food-grade warehouse attestation or audit',
    description: 'GFSI storage & distribution cert, AIB audit, or equivalent food-grade attestation.',
    kind: 'CERTIFICATE',
    sectionType: 'DOCUMENTS',
    requirement: 'CONDITIONAL',
    conditionNote: 'Required if your facility stores food or supplement products.',
    expiring: true,
    appliesTo: ['WAREHOUSE'],
  },
  {
    key: 'fc-hazmat',
    label: 'Hazmat handling certification',
    description: 'Certification for the hazmat classes your facility accepts.',
    kind: 'CERTIFICATE',
    sectionType: 'DOCUMENTS',
    requirement: 'CONDITIONAL',
    conditionNote: 'Required only if you declared hazmat acceptance in capabilities.',
    expiring: true,
    appliesTo: ['WAREHOUSE'],
  },
]

/**
 * The document track for a partner with the given service types. Empty
 * serviceTypes (legacy rows) returns the every-partner baseline only — the
 * role rows attach once services exist.
 */
export function docTrackFor(serviceTypes: readonly string[]): DocRequirement[] {
  return PARTNER_DOC_TRACK.filter(
    (d) => d.appliesTo.length === 0 || d.appliesTo.some((t) => serviceTypes.includes(t)),
  )
}
