// Notification copy + link per event.
// Each template renders from a small payload — keep the payload minimal so the
// callers don't have to fetch entire entities.

import type { NotificationEvent } from '@prisma/client'

export interface NotificationTemplate {
  title: string
  body: string
  link?: string
}

interface TemplateData {
  SECTION_VERIFIED: { sectionType: string; companyName?: string }
  SECTION_NEEDS_CHANGES: { sectionType: string; companyName?: string; notes?: string }
  PARTNER_ACTIVATED: { companyName?: string }
  DISPATCH_RECEIVED: { orderId: string; brandName?: string; type: string }
  DISPATCH_ACCEPT_REMINDER: { dispatchId: string; hoursRemaining: number }
  PARTNER_APPLIED: { companyName: string; partnerEmail: string; partnerId: string }
  PARTNER_SUBMITTED: { companyName: string; partnerId: string }
  ORDER_NEEDS_ATTENTION: { orderId: string; status: string }
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

export function renderTemplate<E extends NotificationEvent>(
  event: E,
  data: TemplateData[E],
): NotificationTemplate {
  switch (event) {
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
    default:
      return { title: `${event}`, body: '' }
  }
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
