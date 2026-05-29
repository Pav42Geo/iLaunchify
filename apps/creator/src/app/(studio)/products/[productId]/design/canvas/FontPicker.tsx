'use client'

// FontPicker — Canva-style "font field" trigger button that lives in
// the TextFormatToolbar (DS-66f).
//
// Click → opens the rich TextFontDrawer in the left rail. The button
// itself just shows the current family name + a chevron, like Canva's
// top-bar font field. The drawer takes over the discovery surface so
// it has full search / category / preview real estate.

import * as React from 'react'
import { ChevronDown } from 'lucide-react'

interface Props {
  value: string
  onClick: () => void
}

export function FontPicker({ value, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={value}
      className="flex items-center gap-1 rounded px-2 py-1 text-[12.5px] hover:bg-ink-100 max-w-[160px]"
      style={{ fontFamily: `"${value}"` }}
    >
      <span className="truncate">{value}</span>
      <ChevronDown className="h-3 w-3 text-ink-500 flex-shrink-0" />
    </button>
  )
}
