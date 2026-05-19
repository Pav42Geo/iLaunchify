// Admin Partners list — URL-driven search + filter + pagination.
//
// Query params:
//   ?q=acme              — text search on companyName / legalName / user.email
//   ?service=MANUFACTURING — filter by PartnerService.type
//   ?status=UNDER_REVIEW — narrow to one status (otherwise grouped view)
//   ?page=2              — pagination, 50 rows per page
//
// When no filter is active, render the existing grouped-by-status layout.
// When any filter is active, render a flat sortable list with pagination
// (no grouping — would be confusing with arbitrary filter cuts).

import { prisma } from '@ilaunchify/db'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button, Input } from '@ilaunchify/ui'
import Link from 'next/link'
import { Search } from 'lucide-react'
import type { PartnerStatus, ServiceType } from '@prisma/client'
import { InvitePartnerDialog } from './InvitePartnerDialog'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Partners — Admin' }

const STATUS_ORDER: PartnerStatus[] = [
  'UNDER_REVIEW',
  'ACTIVE',
  'IN_PROGRESS',
  'INVITED',
  'SUSPENDED',
  'DRAFT',
]
const STATUS_LABELS: Record<PartnerStatus, string> = {
  UNDER_REVIEW: 'Awaiting your review',
  ACTIVE: 'Active',
  IN_PROGRESS: 'Onboarding in progress',
  INVITED: 'Invited',
  SUSPENDED: 'Suspended',
  DRAFT: 'Draft',
}
const SERVICE_LABELS: Record<ServiceType, string> = {
  MANUFACTURING: 'Manufacturing',
  COPACKING: 'Co-packing',
  LABEL_PRINTING: 'Label printing',
}

const PAGE_SIZE = 50

interface PageProps {
  searchParams: Promise<{
    q?: string
    service?: string
    status?: string
    page?: string
  }>
}

function isValidStatus(s: string | undefined): s is PartnerStatus {
  return !!s && (STATUS_ORDER as readonly string[]).includes(s)
}
function isValidService(s: string | undefined): s is ServiceType {
  return !!s && (['MANUFACTURING', 'COPACKING', 'LABEL_PRINTING'] as readonly string[]).includes(s)
}

export default async function PartnersPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const q = sp.q?.trim() || ''
  const service = isValidService(sp.service) ? sp.service : undefined
  const status = isValidStatus(sp.status) ? sp.status : undefined
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1)

  const isFiltered = Boolean(q || service || status)

  // Build the where clause incrementally
  const where = {
    ...(q
      ? {
          OR: [
            { companyName: { contains: q, mode: 'insensitive' as const } },
            { legalName: { contains: q, mode: 'insensitive' as const } },
            { user: { email: { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
    ...(status ? { status } : {}),
    ...(service ? { services: { some: { type: service } } } : {}),
  }

  if (isFiltered) {
    // Flat paginated list
    const [partners, total] = await Promise.all([
      prisma.partner.findMany({
        where,
        include: { user: true, services: true },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.partner.count({ where }),
    ])
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

    return (
      <div className="space-y-6">
        <Header total={total} />
        <FilterBar q={q} service={service} status={status} />
        {partners.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">No matches</CardTitle>
              <CardDescription>Try a different filter combination.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <ul className="space-y-2">
            {partners.map((p) => (
              <PartnerRow key={p.id} partner={p} />
            ))}
          </ul>
        )}
        <Pagination page={page} totalPages={totalPages} q={q} service={service} status={status} />
      </div>
    )
  }

  // No filters → grouped layout
  const all = await prisma.partner.findMany({
    include: { user: true, services: true },
    orderBy: { updatedAt: 'desc' },
  })
  const grouped = STATUS_ORDER.reduce<Record<string, typeof all>>((acc, s) => {
    acc[s] = all.filter((p) => p.status === s)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <Header total={all.length} />
      <FilterBar q="" service={undefined} status={undefined} />
      {STATUS_ORDER.map((s) => {
        const items = grouped[s]
        if (items.length === 0) return null
        return (
          <section key={s}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {STATUS_LABELS[s]} ({items.length})
            </h2>
            <ul className="space-y-2">
              {items.map((p) => (
                <PartnerRow key={p.id} partner={p} />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function Header({ total }: { total: number }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Partners</h1>
        <p className="mt-1 text-sm text-zinc-500">{total} total</p>
      </div>
      <InvitePartnerDialog />
    </div>
  )
}

function FilterBar({
  q,
  service,
  status,
}: {
  q: string
  service: ServiceType | undefined
  status: PartnerStatus | undefined
}) {
  return (
    <Card className="p-4">
      <form className="flex flex-wrap items-end gap-3" method="GET">
        <div className="flex min-w-[240px] flex-1 flex-col text-xs">
          <label className="mb-1 font-medium text-zinc-700">Search</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input
              name="q"
              defaultValue={q}
              placeholder="Company or email…"
              className="pl-8"
            />
          </div>
        </div>

        <div className="flex flex-col text-xs">
          <label className="mb-1 font-medium text-zinc-700">Service type</label>
          <select
            name="service"
            defaultValue={service ?? ''}
            className="rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            {Object.entries(SERVICE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col text-xs">
          <label className="mb-1 font-medium text-zinc-700">Status</label>
          <select
            name="status"
            defaultValue={status ?? ''}
            className="rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit">Filter</Button>
          <Button asChild variant="outline">
            <Link href="/partners">Reset</Link>
          </Button>
        </div>
      </form>
    </Card>
  )
}

function Pagination({
  page,
  totalPages,
  q,
  service,
  status,
}: {
  page: number
  totalPages: number
  q: string
  service: ServiceType | undefined
  status: PartnerStatus | undefined
}) {
  if (totalPages <= 1) return null

  const buildHref = (p: number) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (service) params.set('service', service)
    if (status) params.set('status', status)
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return `/partners${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="flex items-center justify-between border-t border-zinc-200 pt-4 text-sm">
      <span className="text-zinc-500">
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        {page > 1 && (
          <Button asChild variant="outline" size="sm">
            <Link href={buildHref(page - 1)}>← Previous</Link>
          </Button>
        )}
        {page < totalPages && (
          <Button asChild variant="outline" size="sm">
            <Link href={buildHref(page + 1)}>Next →</Link>
          </Button>
        )}
      </div>
    </div>
  )
}

function PartnerRow({
  partner,
}: {
  partner: {
    id: string
    companyName: string
    status: PartnerStatus
    city: string | null
    state: string | null
    country: string
    user: { email: string }
    services: Array<{ type: ServiceType }>
  }
}) {
  return (
    <li>
      <Link href={`/partners/${partner.id}`}>
        <Card className="transition-colors hover:bg-zinc-50">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">{partner.companyName}</CardTitle>
              <CardDescription>
                {partner.services.map((s) => SERVICE_LABELS[s.type]).join(', ') || 'No services'} ·{' '}
                {partner.user.email}
                {partner.city && (
                  <>
                    {' · '}
                    {partner.city}, {partner.state ?? partner.country}
                  </>
                )}
              </CardDescription>
            </div>
            <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium uppercase text-zinc-700">
              {partner.status.replace('_', ' ')}
            </span>
          </CardHeader>
        </Card>
      </Link>
    </li>
  )
}
