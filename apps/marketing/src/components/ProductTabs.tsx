'use client'

import * as React from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@ilaunchify/ui'

/**
 * ProductTabs — the PDP redesign's below-hero tabs (controlled client wrapper).
 *
 * Four tabs: Overview · Recipe & nutrition · Packaging · Compliance &
 * certificates. Overview is the default selected tab.
 *
 * Listens for the `ilf:goto-recipe` custom event (dispatched by the configure
 * box's "Customize recipe →" button) to switch to the Recipe tab and scroll the
 * tab block into view. Tab contents are server-rendered and passed in as props,
 * keeping the heavy data work on the server.
 */
export interface ProductTabsProps {
  overview: React.ReactNode
  recipe: React.ReactNode
  packaging: React.ReactNode
  compliance: React.ReactNode
}

export function ProductTabs({ overview, recipe, packaging, compliance }: ProductTabsProps) {
  const [value, setValue] = React.useState('overview')
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const onGoto = () => {
      setValue('recipe')
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    window.addEventListener('ilf:goto-recipe', onGoto)
    return () => window.removeEventListener('ilf:goto-recipe', onGoto)
  }, [])

  return (
    <div ref={ref} className="scroll-mt-24">
      <Tabs value={value} onValueChange={setValue}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="recipe">Recipe &amp; nutrition</TabsTrigger>
          <TabsTrigger value="packaging">Packaging</TabsTrigger>
          <TabsTrigger value="compliance">Compliance &amp; certificates</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">{overview}</TabsContent>
        <TabsContent value="recipe">{recipe}</TabsContent>
        <TabsContent value="packaging">{packaging}</TabsContent>
        <TabsContent value="compliance">{compliance}</TabsContent>
      </Tabs>
    </div>
  )
}
