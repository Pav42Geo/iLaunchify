'use client'

// =============================================================================
// RowActionsMenu — platform-standard 3-dot row menu (Pavel 2026-06-01)
// =============================================================================
//
// The locked platform pattern for per-row actions in any admin / partner /
// creator table. Renders a ⋮ trigger that opens a dropdown of View / Edit /
// Delete and arbitrary custom actions.
//
// Usage:
//
//   <RowActionsMenu label="Actions for ACME Co.">
//     <RowActionItem href={`/partners/${id}`} icon={Eye}>View</RowActionItem>
//     <RowActionItem href={`/partners/${id}/edit`} icon={Pencil}>Edit</RowActionItem>
//     <RowActionSeparator />
//     <RowActionItem onSelect={handleDelete} icon={Trash2} danger>
//       Delete
//     </RowActionItem>
//   </RowActionsMenu>
//
// Design:
//   • Trigger: 28×28 square button, MoreHorizontal icon, hover bg-ink-100,
//     focus-visible:ring-pink-500.
//   • Menu: white surface, hairline border-ink-200, rounded-xl, shadow-lg.
//   • Items: 32px tall, icon left, label flex-1, danger items get rose tone.
//   • Item with `href`: renders as a <Link> via asChild so navigation
//     happens via Next router.
//   • Item with `onSelect`: regular menu item that fires the callback.
//
// a11y: Radix gives us aria-haspopup / role=menu / arrow-key navigation /
// type-ahead / Esc to close out of the box.

import * as React from 'react'
import * as Dropdown from '@radix-ui/react-dropdown-menu'
import { MoreHorizontal, ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../lib/utils'

// -----------------------------------------------------------------------------
// Root menu — trigger + content
// -----------------------------------------------------------------------------

export interface RowActionsMenuProps {
  /** Accessible label for the trigger ('Actions for {row title}'). */
  label: string
  /** Menu items + separators. */
  children: React.ReactNode
  /** Optional override for the trigger button class. */
  triggerClassName?: string
  /** Side / alignment passed straight to Radix. Default end / bottom. */
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
}

export function RowActionsMenu({
  label,
  children,
  triggerClassName,
  align = 'end',
  side = 'bottom',
}: RowActionsMenuProps) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            'inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-500',
            'transition-colors',
            'hover:bg-ink-100 hover:text-ink-900',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-1',
            'data-[state=open]:bg-ink-100 data-[state=open]:text-ink-900',
            triggerClassName,
          )}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align={align}
          side={side}
          sideOffset={4}
          className={cn(
            'z-50 min-w-[180px] overflow-hidden rounded-[var(--radius-xl)] border border-ink-200 bg-white p-1 shadow-lg',
            'origin-[var(--radix-dropdown-menu-content-transform-origin)]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
            'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
          )}
        >
          {children}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  )
}

// -----------------------------------------------------------------------------
// Menu items
// -----------------------------------------------------------------------------

export interface RowActionItemProps {
  /** Item label content. */
  children: React.ReactNode
  /** Icon shown to the left of the label. */
  icon?: LucideIcon
  /** When provided, the item renders as a `<a href>` (use Next `<Link>` via
   *  the `asChild` pattern in the caller if you need router behavior). */
  href?: string
  /** Click / select handler. */
  onSelect?: () => void
  /** True for destructive actions (Delete, etc.). Rose tone. */
  danger?: boolean
  /** Disable the item without removing it. */
  disabled?: boolean
}

export const RowActionItem = React.forwardRef<HTMLDivElement, RowActionItemProps>(
  ({ children, icon: Icon, href, onSelect, danger, disabled }, ref) => {
    const className = cn(
      'group relative flex w-full cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12.5px] outline-none',
      'transition-colors',
      'focus:bg-ink-50',
      'data-[highlighted]:bg-ink-50',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      danger
        ? 'text-danger-700 data-[highlighted]:bg-danger-50 data-[highlighted]:text-danger-800'
        : 'text-ink-700 data-[highlighted]:text-ink-900',
    )

    const content = (
      <>
        {Icon && (
          <Icon
            className={cn(
              'h-3.5 w-3.5 shrink-0',
              danger ? 'text-danger-500' : 'text-ink-400 group-data-[highlighted]:text-ink-700',
            )}
            aria-hidden="true"
          />
        )}
        <span className="flex-1 truncate">{children}</span>
      </>
    )

    if (href) {
      return (
        <Dropdown.Item ref={ref} asChild disabled={disabled}>
          <a href={href} className={className}>
            {content}
          </a>
        </Dropdown.Item>
      )
    }

    return (
      <Dropdown.Item
        ref={ref}
        onSelect={onSelect}
        disabled={disabled}
        className={className}
      >
        {content}
      </Dropdown.Item>
    )
  },
)
RowActionItem.displayName = 'RowActionItem'

// -----------------------------------------------------------------------------
// Visual separator between groups of items
// -----------------------------------------------------------------------------

export function RowActionSeparator() {
  return (
    <Dropdown.Separator className="mx-1 my-1 h-px bg-ink-100" />
  )
}

// -----------------------------------------------------------------------------
// Optional label / section header inside the menu
// -----------------------------------------------------------------------------

export function RowActionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Dropdown.Label className="px-2.5 py-1 text-[length:var(--fs-sm)] font-bold uppercase tracking-[0.08em] text-ink-700">
      {children}
    </Dropdown.Label>
  )
}

// -----------------------------------------------------------------------------
// Nested submenu — for extended/grouped actions (Pavel 2026-06-01)
// -----------------------------------------------------------------------------
//
// Usage:
//   <RowActionsMenu label="...">
//     <RowActionItem icon={Eye}>View</RowActionItem>
//     <RowActionSubMenu label="More" icon={Settings}>
//       <RowActionItem icon={Download}>Export PDF</RowActionItem>
//       <RowActionItem icon={Share2}>Share link</RowActionItem>
//       <RowActionItem icon={Archive}>Archive</RowActionItem>
//     </RowActionSubMenu>
//   </RowActionsMenu>

export interface RowActionSubMenuProps {
  /** The trigger label shown in the parent menu. */
  label: React.ReactNode
  /** Optional left-side icon. */
  icon?: LucideIcon
  /** Disable the entire submenu without removing it. */
  disabled?: boolean
  /** Submenu items + separators + further nested submenus. */
  children: React.ReactNode
}

export function RowActionSubMenu({
  label,
  icon: Icon,
  disabled,
  children,
}: RowActionSubMenuProps) {
  return (
    <Dropdown.Sub>
      <Dropdown.SubTrigger
        disabled={disabled}
        className={cn(
          'group relative flex w-full cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12.5px] outline-none',
          'transition-colors',
          'data-[highlighted]:bg-ink-50 data-[highlighted]:text-ink-900',
          'data-[state=open]:bg-ink-50 data-[state=open]:text-ink-900',
          'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
          'text-ink-700',
        )}
      >
        {Icon && (
          <Icon
            className="h-3.5 w-3.5 shrink-0 text-ink-400 group-data-[highlighted]:text-ink-700"
            aria-hidden="true"
          />
        )}
        <span className="flex-1 truncate">{label}</span>
        <ChevronRight className="h-3 w-3 shrink-0 text-ink-400" aria-hidden="true" />
      </Dropdown.SubTrigger>
      <Dropdown.Portal>
        <Dropdown.SubContent
          sideOffset={2}
          alignOffset={-4}
          className={cn(
            'z-50 min-w-[180px] overflow-hidden rounded-[var(--radius-xl)] border border-ink-200 bg-white p-1 shadow-lg',
            'origin-[var(--radix-dropdown-menu-content-transform-origin)]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
            'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
          )}
        >
          {children}
        </Dropdown.SubContent>
      </Dropdown.Portal>
    </Dropdown.Sub>
  )
}
