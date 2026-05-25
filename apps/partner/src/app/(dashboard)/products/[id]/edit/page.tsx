// Single-page ProductTemplate editor shell.
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §4.3 + #130.
//
// 10 collapsible cards — each is a self-contained section that doesn't hide
// validation errors from siblings. The right sidebar is sticky and will show
// the live FDA nutrition panel (placeholder for #131).
//
// Most card bodies are stubs in this commit — full cards land in #131 (Basics,
// Ingredients, Allergens, Pricing) and #132 (Packaging, Certs, Media, etc.).
// This commit ships the shell + autosave wiring + Submit-for-review flow.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@ilaunchify/db'
import { requireUser } from '@ilaunchify/auth'
import { ArrowLeft } from 'lucide-react'
import { EditorShell } from './EditorShell'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ProductEditPage({ params }: PageProps) {
  const { id } = await params
  const user = await requireUser()

  const partner = await prisma.partner.findUnique({
    where: { userId: user.id },
    select: { id: true, services: { where: { type: 'MANUFACTURING' }, select: { id: true } } },
  })
  if (!partner) notFound()
  const serviceIds = partner.services.map((s) => s.id)

  const template = await prisma.productTemplate.findUnique({
    where: { id },
    include: {
      subcategory: { select: { name: true, category: { select: { name: true } } } },
      ingredientSlots: {
        include: {
          baseIngredient: { select: { name: true, allergenFlags: true, source: true } },
          replacements: {
            include: { ingredient: { select: { name: true } } },
            orderBy: { displayOrder: 'asc' },
          },
        },
        orderBy: { displayOrder: 'asc' },
      },
      packagingSystems: {
        include: {
          packagingSystem: {
            select: { partnerName: true, topology: true, unitCount: true, moq: true },
          },
        },
      },
      variants: { orderBy: { createdAt: 'asc' } },
      certificates: { select: { instanceId: true } },
    },
  })
  if (!template) notFound()

  // Ownership — partner's manufacturer service must own this template
  if (template.manufacturerServiceId && !serviceIds.includes(template.manufacturerServiceId)) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/products"
          className="mb-2 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to products
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{template.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {template.subcategory.category.name} · {template.subcategory.name}
        </p>
      </header>

      <EditorShell
        template={{
          id: template.id,
          name: template.name,
          slug: template.slug,
          status: template.status,
          description: template.description,
          priceFloorCents: template.priceFloorCents,
          unitCostCents: template.unitCostCents,
          allergenCrossContamination: template.allergenCrossContamination,
          subcategoryName: template.subcategory.name,
          categoryName: template.subcategory.category.name,
        }}
        counts={{
          ingredients: template.ingredientSlots.length,
          packaging: template.packagingSystems.length,
          variants: template.variants.length,
          certificates: template.certificates.length,
        }}
        ingredientSlots={template.ingredientSlots.map((s) => ({
          id: s.id,
          name: s.baseIngredient.name,
          weightG: Number(s.weightG),
          source: s.baseIngredient.source,
          allergens: s.baseIngredient.allergenFlags,
          allowReplacement: s.allowReplacement,
          replacements: s.replacements.map((r) => ({
            id: r.id,
            name: r.ingredient.name,
            weightGOverride: r.weightGOverride != null ? Number(r.weightGOverride) : null,
            calloutText: r.calloutText,
          })),
        }))}
        packagingLinks={template.packagingSystems.map((p) => ({
          packagingSystemId: p.packagingSystemId,
          name: p.packagingSystem.partnerName,
          topology: p.packagingSystem.topology,
          unitCount: p.packagingSystem.unitCount,
          basePriceCents: p.basePriceCents,
          leadTimeDays: p.leadTimeDays,
        }))}
        variants={template.variants.map((v) => ({
          id: v.id,
          flavor: v.flavor,
          containerFormat: v.containerFormat,
          containerSizeG: v.containerSizeG != null ? Number(v.containerSizeG) : null,
          servingsPerContainer: v.servingsPerContainer,
          servingSizeG: Number(v.servingSizeG),
          servingSizeDesc: v.servingSizeDesc,
          moqMin: v.moqMin,
          moqMax: v.moqMax,
          leadTimeDays: v.leadTimeDays,
          unitCostCentsOverride: v.unitCostCentsOverride,
        }))}
        allergenManualOverrides={
          Array.isArray(template.allergenManualOverrides)
            ? (template.allergenManualOverrides as Array<{ allergen: string; action: 'ADD' | 'REMOVE'; reason: string }>)
            : []
        }
      />
    </div>
  )
}
