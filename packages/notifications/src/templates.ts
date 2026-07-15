// Notification copy + link per event.
// Each template renders from a small payload — keep the payload minimal so the
// callers don't have to fetch entire entities.

import type { NotificationEvent } from '@ilaunchify/db'

export interface NotificationTemplate {
  title: string
  body: string
  link?: string
}

// Exported so the token-palette registry (template-tokens.ts) can type-check
// its per-event key lists against the real payload shapes.
export interface TemplateData {
  SECTION_VERIFIED: { sectionType: string; companyName?: string }
  SECTION_NEEDS_CHANGES: { sectionType: string; companyName?: string; notes?: string }
  PARTNER_ACTIVATED: { companyName?: string }
  PARTNER_INVITED: { companyName?: string; onboardingUrl?: string }
  PARTNER_APPLICATION_RECEIVED: { companyName?: string }
  NOMINATION_SERVICE_MISMATCH: { coPartnerName?: string; serviceLabel?: string }
  BRIEF_POSTED_MATCHED: { briefId: string; briefTitle: string; fitScore?: number; nicheName?: string }
  BRIEF_INTEREST_RECEIVED: { briefId: string; briefTitle: string; partnerName?: string }
  BRIEF_INTEREST_SHORTLISTED: { briefTitle: string; creatorName?: string }
  BRIEF_INTEREST_SELECTED: { briefTitle: string; creatorName?: string; roomId?: string }
  BRIEF_INTEREST_PASSED: { briefTitle: string }
  BUILD_OBJECT_SUBMITTED: { roomId: string; objectKind: string; version?: number; byName?: string }
  BUILD_OBJECT_CHANGES_REQUESTED: { roomId: string; objectKind: string; version?: number; byName?: string; note?: string }
  BUILD_OBJECT_APPROVED: { roomId: string; objectKind: string; version?: number; byName?: string }
  MILESTONE_TERMS_PROPOSED: { roomId: string; milestoneKind: string; amount: string; byName?: string; note?: string }
  MILESTONE_TERMS_AGREED: { roomId: string; milestoneKind: string; amount?: string; byName?: string }
  MILESTONE_TERMS_DECLINED: { roomId: string; milestoneKind: string; byName?: string; note?: string }
  // Rooms & Messages hub (2026-07-13) — first-unread-only dispatch (anti-spam)
  ROOM_MESSAGE_RECEIVED: { roomId: string; roomTitle: string; byName?: string; roleLabel?: string; preview?: string }
  DIRECT_MESSAGE_RECEIVED: { conversationId: string; byName?: string; roleLabel?: string; preview?: string }
  // Shared Design Workspace C7 — internal designer⇄creator review loop
  DESIGN_REVIEW_REQUESTED: { roomId: string; briefTitle: string; byName?: string; note?: string }
  DESIGN_REVIEW_DECISION: {
    roomId: string
    briefTitle: string
    decision: string // 'APPROVED' | 'CHANGES_REQUESTED'
    byName?: string
    note?: string
  }
  LEGAL_DOCUMENT_UPDATED: {
    title: string
    version: string
    effectiveAt: string
    summary?: string
    href: string
  }
  PACKAGING_APPROVED: { name: string; category?: string }
  PACKAGING_REJECTED: { name: string; notes?: string }
  DISPATCH_RECEIVED: { orderId: string; brandName?: string; type: string }
  DISPATCH_ACCEPT_REMINDER: { dispatchId: string; hoursRemaining: number }
  PARTNER_ORDER_DISPUTED: { orderId: string }
  CREATOR_PAYMENT_FAILED: { graceUntil: string /* ISO */ }
  CREATOR_SUBSCRIPTION_DOWNGRADED: Record<string, never>
  PARTNER_APPLIED: { companyName: string; partnerEmail: string; partnerId: string }
  PARTNER_SUBMITTED: { companyName: string; partnerId: string }
  ORDER_NEEDS_ATTENTION: { orderId: string; status: string }
  // In-app P1 — specific admin-queue events split out of ORDER_NEEDS_ATTENTION
  // (docs/IN_APP_NOTIFICATIONS_AUDIT.md §4; enum values pending db:push+generate).
  ORDER_CANCELLATION_REQUESTED: { orderId: string; orderRef?: string }
  ORDER_DISPUTE_OPENED: { orderId: string; orderRef?: string; category?: string }
  // Coverage batch 2026-07-06 (audit §2b; enum values pending db:push+generate)
  PARTNER_TEAM_MEMBER_JOINED: { memberName: string; memberEmail?: string; isAdmin?: boolean }
  CREATOR_CHANNEL_CONNECTED: { channelName: string; shopName?: string }
  CREATOR_CHANNEL_DISCONNECTED: { channelName: string }
  // Phase H4 — creator-facing workflow events
  CREATOR_DISPATCH_ACCEPTED: {
    orderId: string
    productName?: string
    partnerName: string
    dispatchType: string
  }
  CREATOR_DISPATCH_CHANGES_REQUESTED: {
    orderId: string
    productName?: string
    partnerName: string
    dispatchType: string
    flaggedFieldCount: number
  }
  CREATOR_DISPATCH_DECLINED: {
    orderId: string
    productName?: string
    partnerName: string
    dispatchType: string
    reason?: string
  }
  CREATOR_DISPATCH_WITHDRAWN: {
    orderId: string
    productName?: string
    partnerName: string
    dispatchType: string
    reason?: string
  }
  CREATOR_ORDER_FULLY_ACCEPTED: {
    orderId: string
    productName?: string
    partnerCount: number
  }
  CREATOR_ORDER_CANCELLED_BY_MANUFACTURER: {
    orderId: string
    productName?: string
    partnerName: string
    reason?: string
  }
  // Phase H4 — admin-facing
  ADMIN_ORDER_CANCELLED_BY_MANUFACTURER: {
    orderId: string
    manufacturerName: string
    reason?: string
  }
  ADMIN_DISPATCH_WITHDRAWN: {
    orderId: string
    dispatchId: string
    partnerName: string
    dispatchType: string
    reason?: string
  }
  // C4 — certificate expiry tracking
  CERT_EXPIRING_SOON: {
    instanceId: string
    certName: string
    daysRemaining: number
    expiryDate: string // ISO
  }
  CERT_EXPIRED: {
    instanceId: string
    certName: string
    expiryDate: string // ISO
    affectedProductCount: number
  }
  ADMIN_CERT_EXPIRED_ON_PUBLISHED: {
    instanceId: string
    certName: string
    companyName: string
    affectedProductCount: number
    creatorNames: string[]
  }
  // Cancellation / dispute review outcomes
  CREATOR_ORDER_CANCELLED: { orderId: string; refundCents?: number }
  CREATOR_ORDER_DISPUTE_RESOLVED: { orderId: string; decision: 'RESOLVED' | 'REJECTED'; outcome?: 'reprint' }
  PARTNER_CANCELLATION_REVIEWED: { orderId: string; decision: 'APPROVED' | 'DENIED' }
  // W2-SUP — support ticketing. `href` is recipient-correct (admin → /support,
  // requester → /help); the service computes it so the host resolves per audience.
  SUPPORT_TICKET_CREATED: { ticketId: string; subject: string; categorySlug?: string; href: string }
  SUPPORT_TICKET_REPLIED: { ticketId: string; subject: string; href: string }
  SUPPORT_TICKET_RESOLVED: { ticketId: string; subject: string; href: string }
  SUPPORT_TICKET_REOPENED: { ticketId: string; subject: string; href: string }
  SUPPORT_SLA_BREACHED: { ticketId: string; subject: string; href: string }
  SUPPORT_REFUND_REQUESTED: { orderId: string; amountCents: number; href: string }
  // Partner role accounts P0 (docs/PARTNER_ROLE_ACCOUNTS.md §6.2). `href` is
  // recipient-correct where the same event fans out to multiple audiences
  // (FC partner vs admin vs creator) — the caller computes it per recipient.
  INBOUND_ASSIGNED: { dispatchId: string; orderRef: string; brandName?: string; trackingCarrier?: string | null; trackingNumber?: string | null }
  INBOUND_DELIVERED_UNCONFIRMED: { dispatchId: string; orderRef: string }
  RECEIVING_DISCREPANCY_OPENED: { orderRef: string; summary: string; href: string }
  RECEIVING_DISCREPANCY_RESOLVED: { orderRef: string; resolutionNote?: string; href: string }
  DISPATCH_SLA_AT_RISK: { dispatchId: string; hoursWaiting: number; hoursRemaining: number }
  DOC_EXPIRING_SOON: { docLabel: string; daysLeft: number; href: string }
  DOC_EXPIRED: { docLabel: string; suspendedCapability?: string; href: string }
  RELEASE_SHIP_SLA_AT_RISK: { orderRef: string; daysWaiting: number }
  // P2 proof loop (D3)
  CREATOR_PROOF_AWAITING: { orderId: string; orderRef: string; version: number; partnerName?: string }
  PROOF_APPROVED: { dispatchId: string; orderRef: string; version: number }
  PROOF_REJECTED: { dispatchId: string; orderRef: string; version: number; annotation?: string }
  // C6.3 channel inventory (CHANNEL_MANAGEMENT_SPEC §3.5a). The alert engine
  // currently precomputes title/body and writes the Notification row directly
  // (channels/inventory/alerts.ts, pending its templates-handoff TODO) — this
  // entry keeps the TemplateData index total and carries the copy through
  // whenever it migrates to dispatchNotification.
  CREATOR_STOCK_ALERT: { title?: string; body?: string; productName?: string; alertState?: string }
  // Feedback module (docs/FEEDBACK_MODULE.md §5/§6) — delivery+3d combined ask.
  // `reminder` flips the copy for the single +10d nudge (same event, no new enum).
  CREATOR_RATE_PARTNERS: {
    orderId: string
    productName?: string
    partnerCount: number
    reminder?: boolean
  }
  // F — job-progress capture (docs/EMAIL_NOTIFICATION_CENTER.md Part 3)
  CREATOR_DISPATCH_PROGRESS: {
    orderId: string
    partnerName: string
    kind: 'NOTE' | 'ETA' | 'PHOTO' | 'MILESTONE'
    summary: string // pre-formatted line, e.g. "updated the delivery estimate to Jul 20, 2026"
    note?: string
  }
  // SR-2.2 (docs/SMART_ROTATION_ENGINE.md §2.6) — delivered sample, no verdict.
  // `reminder` flips the copy for the single +7d nudge (same event).
  CREATOR_SAMPLE_VERDICT: {
    orderId: string
    productName?: string
    printPartnerName?: string
    reminder?: boolean
  }
  // PS-8b (docs/PRINT_PROVIDER_SELECTION.md §10.2) — claimable capability RFQ
  // broadcast to a shortlisted printer. Partial disclosure: spec + run band +
  // region only, never creator designs / brand / manufacturer identity.
  PARTNER_CAPABILITY_RFQ: {
    packagingLabel: string
    decorationLabel?: string
    runBand?: string
    region?: string
    href: string
  }
  // PS-8 follow-up — a paused-for-coverage template is orderable again. One event,
  // role-branched copy: 'manufacturer' (their product re-listed) vs 'creator'
  // (finish your design + order).
  COVERAGE_RESTORED: {
    productName: string
    role: 'manufacturer' | 'creator'
    href: string
  }
  MANUFACTURER_TEMPLATE_PAUSED: {
    productName: string
    reason: 'application_gap' | 'coverage_drop'
    href: string
  }
  // MM-7 — fee grace/promo started for a manufacturer.
  MANUFACTURER_FEE_GRANT_STARTED: {
    feePct: string // e.g. "0%"
    endsAt: string // ISO — window end
    global: boolean // true = welcome/global grace, false = hand-picked grant
    href: string
  }
  // Partner Access & Opportunity requests (docs/PARTNER_ACCESS_ADMIN_CONTROLS_2026-07-14.md)
  PARTNER_ACCESS_REQUEST_SUBMITTED: { companyName: string; leverLabel: string; partnerId: string }
  PARTNER_ACCESS_REQUEST_APPROVED: { leverLabel: string }
  PARTNER_ACCESS_REQUEST_DECLINED: { leverLabel: string }
}

function fmtSection(sectionType: string): string {
  return sectionType
    .toLowerCase()
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ')
}

const PARTNER_APP_URL = process.env.PARTNER_LOGIN_HOST ?? 'http://localhost:3002'
const ADMIN_APP_URL = process.env.ADMIN_LOGIN_HOST ?? 'http://localhost:3003'
const CREATOR_APP_URL = process.env.CREATOR_LOGIN_HOST ?? 'http://localhost:3000'

/** Human labels for co-creation BuildObject kinds (room notifications). */
const OBJECT_KIND_LABEL: Record<string, string> = {
  RECIPE: 'recipe',
  LABEL: 'label',
  PACKAGING: 'packaging',
  SAMPLE: 'sample & spec',
  SPEC_SHEET: 'spec sheet',
}

const MILESTONE_KIND_LABEL: Record<string, string> = {
  DISCOVERY: 'Discovery',
  SAMPLE: 'Sample',
  TOOLING: 'Tooling',
  PRODUCTION: 'Production',
}

export function renderTemplate<E extends NotificationEvent>(
  event: E,
  data: TemplateData[E],
): NotificationTemplate {
  // Switch on the string so newly-added events (pending the NotificationEvent enum
  // migration) compile here before the generated client knows them. The `default`
  // case keeps it total.
  switch (event as string) {
    case 'PACKAGING_APPROVED': {
      const d = data as TemplateData['PACKAGING_APPROVED']
      return {
        title: `“${d.name}” is now in the catalog`,
        body: `Your packaging was approved${d.category ? ` (${d.category.toLowerCase()})` : ''} and is live in the shared Library. Creators can now build on it.`,
        link: '/packaging',
      }
    }
    case 'PACKAGING_REJECTED': {
      const d = data as TemplateData['PACKAGING_REJECTED']
      return {
        title: `“${d.name}” needs changes`,
        body: d.notes ? `Admin note: "${d.notes.slice(0, 200)}"` : 'An admin requested changes before this packaging can join the catalog — see your Packaging page.',
        link: '/packaging',
      }
    }
    case 'SECTION_VERIFIED': {
      const d = data as TemplateData['SECTION_VERIFIED']
      return {
        title: `${fmtSection(d.sectionType)} verified`,
        body: `An admin has verified your ${fmtSection(d.sectionType)} section. One step closer to approval.`,
        link: '/my-application',
      }
    }
    case 'SECTION_NEEDS_CHANGES': {
      const d = data as TemplateData['SECTION_NEEDS_CHANGES']
      return {
        title: `${fmtSection(d.sectionType)} needs changes`,
        body: d.notes
          ? `Admin note: "${d.notes.slice(0, 200)}"`
          : 'An admin has requested changes — see the details in My Application.',
        link: '/my-application',
      }
    }
    case 'PARTNER_ACTIVATED': {
      const d = data as TemplateData['PARTNER_ACTIVATED']
      return {
        title: `Welcome${d.companyName ? `, ${d.companyName}` : ''}!`,
        body: 'Your partner account is now ACTIVE. You can receive dispatches, edit your service profile, and view earnings.',
        link: '/dashboard',
      }
    }
    case 'PARTNER_INVITED': {
      const d = data as TemplateData['PARTNER_INVITED']
      return {
        title: `You're invited to join iLaunchify${d.companyName ? `, ${d.companyName}` : ''}`,
        body: "We reviewed your application and would love to have you in our production network. Click below to start your onboarding — it takes about 15 minutes.",
        link: d.onboardingUrl ?? '/onboarding',
      }
    }
    case 'BRIEF_POSTED_MATCHED': {
      const d = data as TemplateData['BRIEF_POSTED_MATCHED']
      return {
        title: `New matched brief: “${d.briefTitle}”`,
        body: `A creator just posted a ${d.nicheName ? `${d.nicheName} ` : ''}brief that fits your capabilities${typeof d.fitScore === 'number' ? ` (${d.fitScore}% fit)` : ''}. Strong fits get the first look — express interest while the window is open.`,
        link: '/opportunities',
      }
    }
    case 'BRIEF_INTEREST_RECEIVED': {
      const d = data as TemplateData['BRIEF_INTEREST_RECEIVED']
      const who = d.partnerName ?? 'A verified manufacturer'
      return {
        title: `${who} raised a hand on “${d.briefTitle}”`,
        body: `${who} expressed interest in producing your brief — fit, terms, and their pitch are ready to review. Compare everyone interested, then pick your partner.`,
        link: `/briefs/${d.briefId}/interests`,
      }
    }
    case 'BRIEF_INTEREST_SHORTLISTED': {
      const d = data as TemplateData['BRIEF_INTEREST_SHORTLISTED']
      return {
        title: `You're shortlisted for “${d.briefTitle}”`,
        body: `${d.creatorName ?? 'The creator'} starred your interest — you're in the final comparison. No action needed yet; we'll notify you the moment they decide.`,
        link: '/opportunities?tab=mine',
      }
    }
    case 'BRIEF_INTEREST_SELECTED': {
      const d = data as TemplateData['BRIEF_INTEREST_SELECTED']
      return {
        title: `You won “${d.briefTitle}”! 🎉`,
        body: `${d.creatorName ?? 'The creator'} picked you as their manufacturing partner. A private collaboration room is opening — introduce yourself and kick off the Discovery milestone.`,
        link: d.roomId ? `/rooms/${d.roomId}` : '/opportunities?tab=mine',
      }
    }
    case 'BRIEF_INTEREST_PASSED': {
      const d = data as TemplateData['BRIEF_INTEREST_PASSED']
      return {
        title: `Update on “${d.briefTitle}”`,
        body: 'The creator chose another partner for this brief. Thanks for raising your hand — your interest and terms made the comparison stronger, and new matched briefs keep coming.',
        link: '/opportunities',
      }
    }
    case 'BUILD_OBJECT_SUBMITTED': {
      const d = data as TemplateData['BUILD_OBJECT_SUBMITTED']
      const kind = OBJECT_KIND_LABEL[d.objectKind] ?? d.objectKind.toLowerCase()
      return {
        title: `${d.byName ?? 'Your partner'} submitted the ${kind}${d.version ? ` (v${d.version})` : ''}`,
        body: `A new version of the ${kind} is ready for your review in the collaboration room — approve it or request changes.`,
        link: `/rooms/${d.roomId}`,
      }
    }
    case 'BUILD_OBJECT_CHANGES_REQUESTED': {
      const d = data as TemplateData['BUILD_OBJECT_CHANGES_REQUESTED']
      const kind = OBJECT_KIND_LABEL[d.objectKind] ?? d.objectKind.toLowerCase()
      return {
        title: `Changes requested on the ${kind}`,
        body: `${d.byName ?? 'The reviewer'} requested changes${d.note ? `: “${d.note}”` : ''}. Revise and submit a new version in the room.`,
        link: `/rooms/${d.roomId}`,
      }
    }
    case 'BUILD_OBJECT_APPROVED': {
      const d = data as TemplateData['BUILD_OBJECT_APPROVED']
      const kind = OBJECT_KIND_LABEL[d.objectKind] ?? d.objectKind.toLowerCase()
      return {
        title: `${kind[0]?.toUpperCase()}${kind.slice(1)} approved ✓`,
        body: `${d.byName ?? 'The reviewer'} approved the ${kind}${d.version ? ` (v${d.version})` : ''} — it's locked into the decision log. On to the next step.`,
        link: `/rooms/${d.roomId}`,
      }
    }
    case 'MILESTONE_TERMS_PROPOSED': {
      const d = data as TemplateData['MILESTONE_TERMS_PROPOSED']
      const mk = MILESTONE_KIND_LABEL[d.milestoneKind] ?? d.milestoneKind.toLowerCase()
      return {
        title: `${d.byName ?? 'Your maker'} proposed ${mk} terms — $${d.amount}`,
        body: d.note
          ? `Scope: “${d.note}”. Review and agree (or decline) in the collaboration room.`
          : 'Review the proposed amount and scope in the collaboration room — agree or decline.',
        link: `/rooms/${d.roomId}`,
      }
    }
    case 'MILESTONE_TERMS_AGREED': {
      const d = data as TemplateData['MILESTONE_TERMS_AGREED']
      const mk = MILESTONE_KIND_LABEL[d.milestoneKind] ?? d.milestoneKind.toLowerCase()
      return {
        title: `${d.byName ?? 'The creator'} agreed to the ${mk} terms ✓`,
        body: `${d.amount ? `$${d.amount} is locked in. ` : ''}Funding with payment protection opens once payments verification completes — the terms are in the decision log.`,
        link: `/rooms/${d.roomId}`,
      }
    }
    case 'MILESTONE_TERMS_DECLINED': {
      const d = data as TemplateData['MILESTONE_TERMS_DECLINED']
      const mk = MILESTONE_KIND_LABEL[d.milestoneKind] ?? d.milestoneKind.toLowerCase()
      return {
        title: `${mk[0]?.toUpperCase()}${mk.slice(1)} terms declined`,
        body: `${d.byName ?? 'The creator'} declined the proposal${d.note ? `: “${d.note}”` : ''}. Adjust the amount or scope and re-propose in the room.`,
        link: `/rooms/${d.roomId}`,
      }
    }
    case 'ROOM_MESSAGE_RECEIVED': {
      const d = data as TemplateData['ROOM_MESSAGE_RECEIVED']
      return {
        title: `New message in ${d.roomTitle}`,
        body: `${d.byName ?? 'A room member'}${d.roleLabel ? ` (${d.roleLabel})` : ''}: “${d.preview ?? 'New message'}”`,
        link: `/messages?room=${d.roomId}`,
      }
    }
    case 'DIRECT_MESSAGE_RECEIVED': {
      const d = data as TemplateData['DIRECT_MESSAGE_RECEIVED']
      return {
        title: `New message from ${d.byName ?? 'a collaborator'}`,
        body: `${d.roleLabel ? `${d.roleLabel} — ` : ''}“${d.preview ?? 'New direct message'}”`,
        link: `/messages?dm=${d.conversationId}`,
      }
    }
    case 'DESIGN_REVIEW_REQUESTED': {
      const d = data as TemplateData['DESIGN_REVIEW_REQUESTED']
      return {
        title: `${d.byName ?? 'Your designer'} marked the label design ready for review`,
        body: `“${d.briefTitle}”${d.note ? ` — “${d.note}”` : ''}. Approve it internally, then send the proof to your maker.`,
        link: `/rooms/${d.roomId}/label`,
      }
    }
    case 'DESIGN_REVIEW_DECISION': {
      const d = data as TemplateData['DESIGN_REVIEW_DECISION']
      const approved = d.decision === 'APPROVED'
      return {
        title: approved
          ? `${d.byName ?? 'The creator'} approved your label design ✓`
          : `${d.byName ?? 'The creator'} requested changes on the label design`,
        body: approved
          ? `“${d.briefTitle}” — the creator will submit the proof to the maker next.`
          : `“${d.briefTitle}”${d.note ? ` — “${d.note}”` : ''}. Open the workspace to revise.`,
        link: `/rooms/${d.roomId}/label`,
      }
    }
    case 'LEGAL_DOCUMENT_UPDATED': {
      const d = data as TemplateData['LEGAL_DOCUMENT_UPDATED']
      const eff = new Date(d.effectiveAt)
      const effLabel = Number.isNaN(eff.getTime())
        ? null
        : eff.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      return {
        title: `We've updated our ${d.title}`,
        body: `${d.summary ? `${d.summary} ` : ''}The updated ${d.title} (${d.version})${effLabel ? ` takes effect ${effLabel}` : ''}. Please review it and re-accept to continue using iLaunchify.`,
        link: d.href,
      }
    }
    case 'NOMINATION_SERVICE_MISMATCH': {
      const d = data as TemplateData['NOMINATION_SERVICE_MISMATCH']
      const who = d.coPartnerName ?? 'A co-partner you invited'
      const leg = d.serviceLabel ?? 'the invited service'
      return {
        title: `${who} didn’t set up ${leg}`,
        body: `${who} finished onboarding without ${leg}. The nomination is on hold until they add that service — you may want to reach out or re-invite them for the correct leg.`,
        link: '/co-partners',
      }
    }
    case 'PARTNER_APPLICATION_RECEIVED': {
      const d = data as TemplateData['PARTNER_APPLICATION_RECEIVED']
      return {
        title: 'We received your application',
        body: `Thanks${d.companyName ? `, ${d.companyName}` : ''} — your application to become an iLaunchify production partner is in. We review every partner by hand; if it's a fit, you'll get a private invite to onboard, usually within a few business days.`,
        link: '/',
      }
    }
    case 'DISPATCH_RECEIVED': {
      const d = data as TemplateData['DISPATCH_RECEIVED']
      return {
        title: `New ${d.type.toLowerCase()} dispatch${d.brandName ? ` for ${d.brandName}` : ''}`,
        body: `Order #${d.orderId.slice(-8)} is waiting for your acceptance.`,
        link: '/orders',
      }
    }
    case 'DISPATCH_ACCEPT_REMINDER': {
      const d = data as TemplateData['DISPATCH_ACCEPT_REMINDER']
      return {
        title: 'Dispatch acceptance deadline approaching',
        body: `You have ${d.hoursRemaining} hour${d.hoursRemaining === 1 ? '' : 's'} left to accept dispatch ${d.dispatchId.slice(-8)}.`,
        link: `/orders/${d.dispatchId}`,
      }
    }
    case 'CREATOR_PAYMENT_FAILED': {
      const d = data as TemplateData['CREATOR_PAYMENT_FAILED']
      return {
        title: 'Your subscription payment failed',
        body: `We couldn't charge your card. Update your payment method by ${fmtDate(d.graceUntil)} to keep your plan — after that your account moves to the free Maker plan.`,
        link: '/settings/plan',
      }
    }
    case 'CREATOR_SUBSCRIPTION_DOWNGRADED': {
      return {
        title: 'Your plan was downgraded to Maker',
        body: "We couldn't collect your subscription payment within the grace period, so your account is now on the free Maker plan. Re-subscribe anytime to restore your features.",
        link: '/settings/plan',
      }
    }
    case 'PARTNER_ORDER_DISPUTED': {
      const d = data as TemplateData['PARTNER_ORDER_DISPUTED']
      return {
        title: `A dispute was opened on order #${d.orderId.slice(-8)}`,
        body: 'A creator reported an issue with an order you produced. Open the order to add your side so the admin can review it.',
        link: '/orders',
      }
    }
    case 'PARTNER_APPLIED': {
      const d = data as TemplateData['PARTNER_APPLIED']
      return {
        title: `New partner application: ${d.companyName}`,
        body: `${d.partnerEmail} applied. Review when ready.`,
        link: `/partners/${d.partnerId}`,
      }
    }
    case 'PARTNER_SUBMITTED': {
      const d = data as TemplateData['PARTNER_SUBMITTED']
      return {
        title: `${d.companyName} submitted for review`,
        body: 'Onboarding complete — verification queue awaits.',
        link: `/partners/${d.partnerId}/verification`,
      }
    }
    case 'ORDER_NEEDS_ATTENTION': {
      const d = data as TemplateData['ORDER_NEEDS_ATTENTION']
      return {
        title: `Order needs attention — ${d.status}`,
        body: `Order #${d.orderId.slice(-8)} moved to ${d.status}.`,
        link: `/orders/${d.orderId}`,
      }
    }
    // In-app P1 — split out of ORDER_NEEDS_ATTENTION so the admin queue reads
    // without clicking (docs/IN_APP_NOTIFICATIONS_AUDIT.md §4).
    case 'ORDER_CANCELLATION_REQUESTED': {
      const d = data as TemplateData['ORDER_CANCELLATION_REQUESTED']
      return {
        title: `Cancellation requested · ${d.orderRef ?? `#${d.orderId.slice(-8)}`}`,
        body: 'A creator asked to cancel this order — review it in the cancellations queue.',
        link: '/cancellations',
      }
    }
    case 'ORDER_DISPUTE_OPENED': {
      const d = data as TemplateData['ORDER_DISPUTE_OPENED']
      return {
        title: `Dispute opened · ${d.orderRef ?? `#${d.orderId.slice(-8)}`}`,
        body: `A creator opened a dispute${d.category ? ` (${d.category.toLowerCase()})` : ''} — review it in the disputes queue.`,
        link: '/disputes',
      }
    }
    // --- Coverage batch 2026-07-06 (audit §2b) -----------------------------
    case 'PARTNER_TEAM_MEMBER_JOINED': {
      const d = data as TemplateData['PARTNER_TEAM_MEMBER_JOINED']
      return {
        title: `${d.memberName} joined your team`,
        body: `${d.memberEmail ? `${d.memberEmail} ` : ''}accepted your invite${d.isAdmin ? ' as an org admin' : ''}. Manage roles and access on the Team page.`,
        link: '/settings/team',
      }
    }
    case 'CREATOR_CHANNEL_CONNECTED': {
      const d = data as TemplateData['CREATOR_CHANNEL_CONNECTED']
      return {
        title: `${d.channelName} connected${d.shopName ? ` · ${d.shopName}` : ''}`,
        body: 'The sales channel is linked to your account — you can publish products and route orders to it. Not you? Disconnect it now.',
        link: '/channels',
      }
    }
    case 'CREATOR_CHANNEL_DISCONNECTED': {
      const d = data as TemplateData['CREATOR_CHANNEL_DISCONNECTED']
      return {
        title: `${d.channelName} disconnected`,
        body: 'Publishing and order routing to this channel stopped. Reconnect any time from the Channels hub.',
        link: '/channels',
      }
    }
    // -----------------------------------------------------------------------
    // Phase H4 — creator-facing
    // -----------------------------------------------------------------------
    case 'CREATOR_DISPATCH_ACCEPTED': {
      const d = data as TemplateData['CREATOR_DISPATCH_ACCEPTED']
      const which = humanDispatchType(d.dispatchType)
      return {
        title: `${d.partnerName} accepted your ${which} dispatch`,
        body: d.productName
          ? `Your order for ${d.productName} (#${d.orderId.slice(-8)}) is one step closer to production.`
          : `Order #${d.orderId.slice(-8)} is one step closer to production.`,
        link: `/orders/${d.orderId}`,
      }
    }
    case 'CREATOR_DISPATCH_CHANGES_REQUESTED': {
      const d = data as TemplateData['CREATOR_DISPATCH_CHANGES_REQUESTED']
      const which = humanDispatchType(d.dispatchType)
      return {
        title: `${d.partnerName} needs you to adjust your order`,
        body: `Your ${which} partner flagged ${d.flaggedFieldCount} ${d.flaggedFieldCount === 1 ? 'field' : 'fields'} on order #${d.orderId.slice(-8)}. Review and resubmit.`,
        link: `/orders/${d.orderId}`,
      }
    }
    case 'CREATOR_DISPATCH_DECLINED': {
      const d = data as TemplateData['CREATOR_DISPATCH_DECLINED']
      const which = humanDispatchType(d.dispatchType)
      return {
        title: `${d.partnerName} declined the ${which} dispatch`,
        body: d.reason
          ? `Reason: "${d.reason.slice(0, 200)}". We're routing to another partner.`
          : `We're routing to another partner. You'll be notified when the new partner picks it up.`,
        link: `/orders/${d.orderId}`,
      }
    }
    case 'CREATOR_DISPATCH_WITHDRAWN': {
      const d = data as TemplateData['CREATOR_DISPATCH_WITHDRAWN']
      const which = humanDispatchType(d.dispatchType)
      return {
        title: `${d.partnerName} withdrew from the ${which} dispatch`,
        body: d.reason
          ? `Reason: "${d.reason.slice(0, 200)}". Order paused while admin reroutes.`
          : `Order paused while admin reroutes.`,
        link: `/orders/${d.orderId}`,
      }
    }
    case 'CREATOR_ORDER_FULLY_ACCEPTED': {
      const d = data as TemplateData['CREATOR_ORDER_FULLY_ACCEPTED']
      return {
        title: 'Production starting! 🎉',
        body: d.productName
          ? `All ${d.partnerCount} partners signed off on ${d.productName}. Production has begun.`
          : `All ${d.partnerCount} partners signed off on order #${d.orderId.slice(-8)}. Production has begun.`,
        link: `/orders/${d.orderId}`,
      }
    }
    case 'CREATOR_ORDER_CANCELLED_BY_MANUFACTURER': {
      const d = data as TemplateData['CREATOR_ORDER_CANCELLED_BY_MANUFACTURER']
      return {
        title: `Order cancelled — ${d.partnerName} can't fulfill`,
        body: d.reason
          ? `Reason: "${d.reason.slice(0, 200)}". A full refund is on the way. Pick another product or contact support.`
          : `A full refund is on the way. Pick another product or contact support.`,
        link: `/orders/${d.orderId}`,
      }
    }
    // -----------------------------------------------------------------------
    // Phase H4 — admin-facing
    // -----------------------------------------------------------------------
    case 'ADMIN_ORDER_CANCELLED_BY_MANUFACTURER': {
      const d = data as TemplateData['ADMIN_ORDER_CANCELLED_BY_MANUFACTURER']
      return {
        title: `Manufacturer cancelled order ${d.orderId.slice(-8)}`,
        body: `${d.manufacturerName} rejected the order — refund needs processing. ${d.reason ? `Reason: "${d.reason.slice(0, 200)}".` : ''}`,
        link: `/orders/${d.orderId}`,
      }
    }
    case 'ADMIN_DISPATCH_WITHDRAWN': {
      const d = data as TemplateData['ADMIN_DISPATCH_WITHDRAWN']
      return {
        title: `${d.partnerName} withdrew dispatch ${d.dispatchId.slice(-8)}`,
        body: `${humanDispatchType(d.dispatchType)} on order ${d.orderId.slice(-8)} needs reroute. ${d.reason ? `Reason: "${d.reason.slice(0, 200)}".` : ''}`,
        link: `/orders/${d.orderId}`,
      }
    }
    // -----------------------------------------------------------------------
    // C4 — certificate expiry tracking
    // -----------------------------------------------------------------------
    case 'CERT_EXPIRING_SOON': {
      const d = data as TemplateData['CERT_EXPIRING_SOON']
      const when = fmtDate(d.expiryDate)
      return {
        title:
          d.daysRemaining <= 7
            ? `${d.certName} expires in ${d.daysRemaining} day${d.daysRemaining === 1 ? '' : 's'}`
            : `${d.certName} expires soon`,
        body: `Your ${d.certName} certificate expires on ${when}. Renew it now so your live products keep their verified badge.`,
        link: `/certifications?renew=${d.instanceId}`,
      }
    }
    case 'CERT_EXPIRED': {
      const d = data as TemplateData['CERT_EXPIRED']
      return {
        title: `${d.certName} has expired`,
        body:
          d.affectedProductCount > 0
            ? `Your ${d.certName} certificate expired on ${fmtDate(d.expiryDate)}. ${d.affectedProductCount} product${d.affectedProductCount === 1 ? '' : 's'} now need${d.affectedProductCount === 1 ? 's' : ''} a refreshed cert. Renew to restore the badge.`
            : `Your ${d.certName} certificate expired on ${fmtDate(d.expiryDate)}. Renew it to keep attaching it to products.`,
        link: `/certifications?renew=${d.instanceId}`,
      }
    }
    case 'ADMIN_CERT_EXPIRED_ON_PUBLISHED': {
      const d = data as TemplateData['ADMIN_CERT_EXPIRED_ON_PUBLISHED']
      const creators =
        d.creatorNames.length > 0
          ? ` Affected creators: ${d.creatorNames.slice(0, 5).join(', ')}${d.creatorNames.length > 5 ? `, +${d.creatorNames.length - 5} more` : ''}.`
          : ''
      return {
        title: `Expired cert on ${d.affectedProductCount} live product${d.affectedProductCount === 1 ? '' : 's'}`,
        body: `${d.companyName}'s ${d.certName} expired while attached to ${d.affectedProductCount} PUBLISHED product${d.affectedProductCount === 1 ? '' : 's'}.${creators} Products are flagged "needs cert refresh".`,
        link: `/audit`,
      }
    }
    case 'CREATOR_ORDER_CANCELLED': {
      const d = data as TemplateData['CREATOR_ORDER_CANCELLED']
      const refund =
        typeof d.refundCents === 'number'
          ? ` A refund of $${(d.refundCents / 100).toFixed(2)} will follow per our cancellation policy.`
          : ''
      return {
        title: `Order #${d.orderId.slice(-8)} was cancelled`,
        body: `Your order has been cancelled.${refund}`,
        link: `/orders/${d.orderId}`,
      }
    }
    case 'CREATOR_ORDER_DISPUTE_RESOLVED': {
      const d = data as TemplateData['CREATOR_ORDER_DISPUTE_RESOLVED']
      // P3 reprint outcome (Code's createReprintDispatch passes outcome:'reprint')
      // — same event, reprint-specific copy. No new enum value needed.
      if (d.outcome === 'reprint') {
        return {
          title: `Reprint on the way · order #${d.orderId.slice(-8)}`,
          body: 'We reviewed your report and resolved it in your favor — your print partner is producing a corrected run at no charge. Track it on the order.',
          link: `/orders/${d.orderId}`,
        }
      }
      return {
        title: `Your dispute on order #${d.orderId.slice(-8)} was ${d.decision.toLowerCase()}`,
        body:
          d.decision === 'RESOLVED'
            ? 'We reviewed your report and resolved it in your favor. See the order for details.'
            : 'We reviewed your report and were unable to uphold it. See the order for details.',
        link: `/orders/${d.orderId}`,
      }
    }
    case 'PARTNER_CANCELLATION_REVIEWED': {
      const d = data as TemplateData['PARTNER_CANCELLATION_REVIEWED']
      return {
        title: `Cancellation request ${d.decision.toLowerCase()}`,
        body:
          d.decision === 'APPROVED'
            ? `Your cancellation request for order #${d.orderId.slice(-8)} was approved.`
            : `Your cancellation request for order #${d.orderId.slice(-8)} was denied — please fulfill the order.`,
        link: `/orders/${d.orderId}`,
      }
    }
    case 'SUPPORT_TICKET_CREATED': {
      const d = data as TemplateData['SUPPORT_TICKET_CREATED']
      return {
        title: `New support ticket: ${d.subject}`,
        body: `A new support ticket was filed${d.categorySlug ? ` under "${d.categorySlug}"` : ''}. Triage and respond.`,
        link: d.href,
      }
    }
    case 'SUPPORT_TICKET_REPLIED': {
      const d = data as TemplateData['SUPPORT_TICKET_REPLIED']
      return {
        title: `New reply on “${d.subject}”`,
        body: 'There is a new reply on your support ticket.',
        link: d.href,
      }
    }
    case 'SUPPORT_TICKET_RESOLVED': {
      const d = data as TemplateData['SUPPORT_TICKET_RESOLVED']
      return {
        title: `Your ticket “${d.subject}” was resolved`,
        body: 'We marked your support ticket resolved. If it still needs attention, reply to reopen it.',
        link: d.href,
      }
    }
    case 'SUPPORT_TICKET_REOPENED': {
      const d = data as TemplateData['SUPPORT_TICKET_REOPENED']
      return {
        title: `Ticket reopened: “${d.subject}”`,
        body: 'A support ticket you own was reopened and needs another look.',
        link: d.href,
      }
    }
    case 'SUPPORT_SLA_BREACHED': {
      const d = data as TemplateData['SUPPORT_SLA_BREACHED']
      return {
        title: `SLA breached: “${d.subject}”`,
        body: 'This support ticket passed its response SLA window without a first reply.',
        link: d.href,
      }
    }
    case 'SUPPORT_REFUND_REQUESTED': {
      const d = data as TemplateData['SUPPORT_REFUND_REQUESTED']
      return {
        title: `Refund requested · $${(d.amountCents / 100).toFixed(2)}`,
        body: `A support agent proposed a refund on order #${d.orderId.slice(-8)} — review to approve or reject.`,
        link: d.href,
      }
    }
    // Partner order packets G2 (docs/PARTNER_ORDER_PACKETS.md) — FC hears about an
    // inbound the moment the producing partner ships, not when someone chases it.
    case 'INBOUND_ASSIGNED': {
      const d = data as TemplateData['INBOUND_ASSIGNED']
      const tracking =
        d.trackingNumber ? ` Tracking: ${d.trackingCarrier ? `${d.trackingCarrier} ` : ''}${d.trackingNumber}.` : ''
      return {
        title: `Inbound shipment on the way · ${d.orderRef}`,
        body: `A producing partner shipped goods bound for your facility${d.brandName ? ` (${d.brandName})` : ''}.${tracking} Review the inbound and prepare receiving.`,
        link: `/inbound/${d.dispatchId}`,
      }
    }
    // Partner role accounts P0 (docs/PARTNER_ROLE_ACCOUNTS.md §6.2)
    case 'INBOUND_DELIVERED_UNCONFIRMED': {
      const d = data as TemplateData['INBOUND_DELIVERED_UNCONFIRMED']
      return {
        title: 'Inbound shipment awaiting receipt confirmation',
        body: `Order ${d.orderRef} shows delivered by the carrier but hasn't been received into your facility yet. Confirm the receipt to keep your receiving SLA on track.`,
        link: `/inbound/${d.dispatchId}`,
      }
    }
    case 'RECEIVING_DISCREPANCY_OPENED': {
      const d = data as TemplateData['RECEIVING_DISCREPANCY_OPENED']
      return {
        title: `Receiving discrepancy filed · ${d.orderRef}`,
        body: `${d.summary} iLaunchify is reviewing and will coordinate the resolution.`,
        link: d.href,
      }
    }
    case 'RECEIVING_DISCREPANCY_RESOLVED': {
      const d = data as TemplateData['RECEIVING_DISCREPANCY_RESOLVED']
      return {
        title: `Receiving discrepancy resolved · ${d.orderRef}`,
        body: d.resolutionNote
          ? `Resolution: ${d.resolutionNote.slice(0, 200)}`
          : 'The receiving discrepancy on this order has been resolved.',
        link: d.href,
      }
    }
    case 'DISPATCH_SLA_AT_RISK': {
      const d = data as TemplateData['DISPATCH_SLA_AT_RISK']
      return {
        title: 'Dispatch acceptance at risk',
        body: `Dispatch ${d.dispatchId.slice(-8)} has been waiting ${d.hoursWaiting}h — ${d.hoursRemaining}h left before the acceptance window closes and the order is rerouted or cancelled.`,
        link: `/orders/${d.dispatchId}`,
      }
    }
    case 'DOC_EXPIRING_SOON': {
      const d = data as TemplateData['DOC_EXPIRING_SOON']
      return {
        title: `${d.docLabel} expires in ${d.daysLeft} day${d.daysLeft === 1 ? '' : 's'}`,
        body: 'Upload a renewed document before it lapses — expired documents suspend the capabilities they back.',
        link: d.href,
      }
    }
    case 'CREATOR_STOCK_ALERT': {
      const d = data as TemplateData['CREATOR_STOCK_ALERT']
      return {
        title: d.title ?? `Stock alert${d.productName ? ` · ${d.productName}` : ''}`,
        body: d.body ?? 'A channel inventory pool changed alert state — review your stock levels.',
        link: '/channels/inventory',
      }
    }
    case 'CREATOR_PROOF_AWAITING': {
      const d = data as TemplateData['CREATOR_PROOF_AWAITING']
      return {
        title: `Print proof v${d.version} awaiting your approval · ${d.orderRef}`,
        body: 'Your print partner uploaded a pre-production proof. Production is paused until you approve it — review and approve or request changes.',
        link: `/orders/${d.orderId}`,
      }
    }
    case 'PROOF_APPROVED': {
      const d = data as TemplateData['PROOF_APPROVED']
      return {
        title: `Proof v${d.version} approved · ${d.orderRef}`,
        body: 'The creator approved your proof — you can proceed to production and mark the job ready.',
        link: `/orders/${d.dispatchId}`,
      }
    }
    case 'PROOF_REJECTED': {
      const d = data as TemplateData['PROOF_REJECTED']
      return {
        title: `Proof v${d.version} rejected · ${d.orderRef}`,
        body: d.annotation
          ? `Creator note: "${d.annotation.slice(0, 200)}" — upload a corrected proof.`
          : 'The creator requested changes — upload a corrected proof.',
        link: `/orders/${d.dispatchId}`,
      }
    }
    case 'RELEASE_SHIP_SLA_AT_RISK': {
      const d = data as TemplateData['RELEASE_SHIP_SLA_AT_RISK']
      return {
        title: `Stock release waiting ${d.daysWaiting} day${d.daysWaiting === 1 ? '' : 's'} · ${d.orderRef}`,
        body: 'A requested release is still unshipped — pick and ship it to keep the fulfillment SLA on track.',
        link: '/outbound',
      }
    }
    case 'DOC_EXPIRED': {
      const d = data as TemplateData['DOC_EXPIRED']
      return {
        title: `${d.docLabel} has expired`,
        body: d.suspendedCapability
          ? `Your ${d.suspendedCapability} eligibility is paused until a renewed document is verified.`
          : 'Upload a renewed document to restore full eligibility.',
        link: d.href,
      }
    }
    case 'CREATOR_RATE_PARTNERS': {
      const d = data as TemplateData['CREATOR_RATE_PARTNERS']
      const what = d.productName ?? `order #${d.orderId.slice(-8)}`
      return {
        title: d.reminder
          ? `Still time to rate your partners on ${what}`
          : `How did your partners do on ${what}?`,
        body:
          d.partnerCount === 1
            ? 'Your honest rating shapes how partners grow here — it reflects their standing and helps route future orders to the best of them. Please rate fairly, from your real experience. Under a minute, and you can review your product while you’re there.'
            : `${d.partnerCount} partners worked on this order. Your honest ratings shape how they grow here — reflecting their standing and routing future work to the best partners. Please rate fairly, from your real experience; you can review your product too. Under a minute.`,
        link: `/orders/${d.orderId}/rate`,
      }
    }
    case 'CREATOR_DISPATCH_PROGRESS': {
      const d = data as TemplateData['CREATOR_DISPATCH_PROGRESS']
      return {
        title: `${d.partnerName} ${d.summary}`,
        body: d.note
          ? `"${d.note.slice(0, 200)}" — see the running timeline on your order.`
          : `Order #${d.orderId.slice(-8)} has a new production update — see the running timeline on your order.`,
        link: `/orders/${d.orderId}`,
      }
    }
    case 'CREATOR_SAMPLE_VERDICT': {
      const d = data as TemplateData['CREATOR_SAMPLE_VERDICT']
      const what = d.productName ?? `sample #${d.orderId.slice(-8)}`
      return {
        title: d.reminder
          ? `Your ${what} sample is still waiting on a verdict`
          : `Your ${what} sample arrived — how does it look?`,
        body: d.printPartnerName
          ? `Judge the product and the print separately: happy with ${d.printPartnerName}'s print and we lock them in for your production run — not happy, and you can try another provider before ordering bulk. Two clicks.`
          : 'Approve it and your production chain is locked in — or tell us what fell short before you order bulk. Two clicks.',
        link: `/orders/${d.orderId}`,
      }
    }
    case 'PARTNER_CAPABILITY_RFQ': {
      const d = data as TemplateData['PARTNER_CAPABILITY_RFQ']
      const what = d.decorationLabel ? `${d.decorationLabel} for ${d.packagingLabel}` : d.packagingLabel
      return {
        title: `A manufacturer needs ${what} printing`,
        body: `You already run compatible presses${d.region ? ` near ${d.region}` : ''} — claim this job to add it to your catalog${d.runBand ? ` (${d.runBand} units)` : ''}. You'll see the full spec once you claim; designs stay private until then.`,
        link: d.href,
      }
    }
    case 'COVERAGE_RESTORED': {
      const d = data as TemplateData['COVERAGE_RESTORED']
      return d.role === 'manufacturer'
        ? {
            title: `${d.productName} is back on the marketplace`,
            body: 'A printer now covers its printing, so it\'s live and orderable again. No action needed — just letting you know.',
            link: d.href,
          }
        : {
            title: `${d.productName} is available again`,
            body: 'Printing is sorted — pick up your design and place your order whenever you\'re ready.',
            link: d.href,
          }
    }
    case 'MANUFACTURER_TEMPLATE_PAUSED': {
      const d = data as TemplateData['MANUFACTURER_TEMPLATE_PAUSED']
      return d.reason === 'application_gap'
        ? {
            title: `${d.productName} was paused — label application isn't covered`,
            body: 'This product uses an applied decoration (e.g. pressure-sensitive label) but nothing in its workflow can apply it. Enable a co-pack route or a self-applying manufacturer, then it re-lists automatically.',
            link: d.href,
          }
        : {
            title: `${d.productName} was paused — no printer covers it`,
            body: 'Its print coverage dropped to zero, so ordering is paused. We\'ve broadcast a capability request to qualified printers; it re-lists automatically once one is verified.',
            link: d.href,
          }
    }
    case 'MANUFACTURER_FEE_GRANT_STARTED': {
      const d = data as TemplateData['MANUFACTURER_FEE_GRANT_STARTED']
      return {
        title: `You're at ${d.feePct} platform fee${d.feePct === '0%' ? ' — on us' : ''}`,
        body: `${d.global ? 'Welcome! As a new manufacturer you' : 'You'}'ve been placed on a ${d.feePct} platform fee through ${fmtDate(d.endsAt)}. Your badge is unaffected — this is a fee grace on top of your standing. No action needed.`,
        link: d.href,
      }
    }
    case 'PARTNER_ACCESS_REQUEST_SUBMITTED': {
      const d = data as TemplateData['PARTNER_ACCESS_REQUEST_SUBMITTED']
      return {
        title: `${d.companyName} requested ${d.leverLabel}`,
        body: `A partner asked to unlock ${d.leverLabel}. Review it in Access requests.`,
        link: '/settings/partner-access?tab=requests',
      }
    }
    case 'PARTNER_ACCESS_REQUEST_APPROVED': {
      const d = data as TemplateData['PARTNER_ACCESS_REQUEST_APPROVED']
      return {
        title: `${d.leverLabel} unlocked`,
        body: `Good news: your request for ${d.leverLabel} was approved. It is now active on your account.`,
        link: '/settings/participation',
      }
    }
    case 'PARTNER_ACCESS_REQUEST_DECLINED': {
      const d = data as TemplateData['PARTNER_ACCESS_REQUEST_DECLINED']
      return {
        title: `Update on your ${d.leverLabel} request`,
        body: `Your request for ${d.leverLabel} was not approved this time. Reach out to our team if you have questions.`,
        link: '/settings/participation',
      }
    }
    default:
      return { title: `${event}`, body: '' }
  }
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function humanDispatchType(t: string): string {
  if (t === 'PRODUCT') return 'manufacturer'
  if (t === 'LABEL') return 'print'
  if (t === 'ACCESSORY') return 'accessory'
  return t.toLowerCase()
}

// Resolve an app-relative link to an absolute URL for use in email bodies.
// Picks the host based on the receiving user's audience.
export function absoluteLink(link: string, audience: 'admin' | 'partner' | 'creator'): string {
  if (link.startsWith('http')) return link
  const host =
    audience === 'admin'
      ? ADMIN_APP_URL
      : audience === 'creator'
        ? CREATOR_APP_URL
        : PARTNER_APP_URL
  return `${host}${link}`
}
