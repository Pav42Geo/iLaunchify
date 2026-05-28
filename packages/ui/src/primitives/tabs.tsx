'use client'

import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '../lib/utils'

/**
 * Tabs — built on Radix Tabs.
 *
 * Default styling follows the locked design system pattern: light surface,
 * black underline on the active tab, ink-600 inactive labels. Use for
 * deep-spec sections on detail pages and admin queues.
 */

export const Tabs = TabsPrimitive.Root

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex items-center justify-start gap-8 border-b border-ink-200 w-full',
      className,
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center py-3 text-[15px] font-semibold whitespace-nowrap ' +
        'text-ink-500 hover:text-ink-900 ' +
        'border-b-2 border-transparent -mb-px ' +
        'data-[state=active]:text-ink-900 data-[state=active]:border-ink-900 ' +
        'transition-[color,border-color] duration-base ease-out-quart ' +
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500',
      className,
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-6 focus-visible:outline-none',
      className,
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName
