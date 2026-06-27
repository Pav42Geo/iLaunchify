'use client'

// Shared builder UI primitives — the single source of the Add-Product form's
// chrome so every step/section looks identical (2026-06-27). Section titles,
// field labels, dropdown multi-selects and the rich-text description editor all
// live here. Rendered inside GuidedBuilder's `.gb` style scope; styling is in
// GuidedBuilder's CSS constant.

import { useEffect, useRef, useState } from 'react'
import { Bold, Italic, List, ChevronDown, Check, type LucideIcon } from 'lucide-react'

// --- Section: a titled card with a consistent icon tile -------------------

export function Section({
  icon: Icon, title, action, tip, children,
}: {
  icon: LucideIcon
  title: string
  action?: React.ReactNode
  tip?: string
  children: React.ReactNode
}) {
  return (
    <div className="card">
      <div className="sec-head">
        <div className="section-title">
          <span className="ic"><Icon size={16} strokeWidth={2} /></span>
          {title}
          {tip && <Info tip={tip} />}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

export function Info({ tip }: { tip: string }) {
  return <i className="info" data-tip={tip} tabIndex={0} role="img" aria-label={tip}>i</i>
}

// --- Field: top-aligned, readable label over its control ------------------

export function Field({
  label, full, children,
}: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className="field" style={full ? { gridColumn: '1/3' } : undefined}>
      <label>{label}</label>
      {children}
    </div>
  )
}

// --- MultiSelect: dropdown with checkboxes (replaces chip rows) ------------

export interface SelectOption { value: string; label: string; group?: string }

export function MultiSelect({
  options, selected, onChange, placeholder = 'Select…', disabled,
}: {
  options: SelectOption[]
  selected: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const labels = options.filter((o) => selected.includes(o.value)).map((o) => o.label)
  const summary = labels.length === 0
    ? placeholder
    : labels.length <= 2 ? labels.join(', ') : `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])

  return (
    <div className="msel" ref={wrap}>
      <button
        type="button"
        className={'msel-btn' + (labels.length ? '' : ' empty')}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="msel-sum">{summary}</span>
        <ChevronDown size={16} className="chev" />
      </button>
      {open && !disabled && (
        <div className="msel-panel" role="listbox" aria-multiselectable>
          {options.map((o) => {
            const on = selected.includes(o.value)
            return (
              <div
                key={o.value}
                className={'msel-opt' + (on ? ' on' : '')}
                role="option"
                aria-selected={on}
                onClick={() => toggle(o.value)}
              >
                <span className="box">{on && <Check size={12} strokeWidth={3.5} />}</span>
                <span>{o.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// --- SmartTextInput: single-line input with a live character counter -------

export function SmartTextInput({
  value, onChange, placeholder, maxLength = 120,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  maxLength?: number
}) {
  const over = value.length > maxLength
  return (
    <div>
      <input className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      <div className={'smart-foot' + (over ? ' over' : '')}>{value.length}/{maxLength}</div>
    </div>
  )
}

// --- RichTextField: bold / italic / bullet list + counter ------------------

const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'UL', 'OL', 'LI', 'P', 'BR'])

/** Allowlist sanitizer — keeps only basic formatting tags, strips all
 *  attributes. Runs client-side (the editor is a client component). */
export function sanitizeRichHtml(html: string): string {
  if (!html) return ''
  if (typeof document === 'undefined') return html
  const root = document.createElement('div')
  root.innerHTML = html
  const walk = (node: Element) => {
    Array.from(node.children).forEach((child) => {
      if (!ALLOWED_TAGS.has(child.tagName)) {
        child.replaceWith(document.createTextNode(child.textContent ?? ''))
      } else {
        Array.from(child.attributes).forEach((a) => child.removeAttribute(a.name))
        walk(child)
      }
    })
  }
  walk(root)
  return root.innerHTML.trim()
}

export function RichTextField({
  value, onChange, placeholder, maxLength = 600,
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  maxLength?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [len, setLen] = useState(0)
  const [active, setActive] = useState({ bold: false, italic: false, ul: false })

  // Seed initial HTML once (uncontrolled body — avoids caret jumps on re-render).
  useEffect(() => {
    if (ref.current && !ref.current.innerHTML) {
      ref.current.innerHTML = sanitizeRichHtml(value)
      setLen(ref.current.textContent?.length ?? 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refreshActive = () => {
    if (typeof document === 'undefined') return
    setActive({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      ul: document.queryCommandState('insertUnorderedList'),
    })
  }
  const sync = () => {
    if (!ref.current) return
    setLen(ref.current.textContent?.length ?? 0)
    onChange(sanitizeRichHtml(ref.current.innerHTML))
    refreshActive()
  }
  const exec = (cmd: string) => { document.execCommand(cmd, false); ref.current?.focus(); sync() }
  const over = len > maxLength

  return (
    <div className="rte">
      <div className="rte-bar">
        <button type="button" className={'rte-b' + (active.bold ? ' on' : '')} aria-label="Bold" aria-pressed={active.bold} onMouseDown={(e) => { e.preventDefault(); exec('bold') }}><Bold size={15} /></button>
        <button type="button" className={'rte-b' + (active.italic ? ' on' : '')} aria-label="Italic" aria-pressed={active.italic} onMouseDown={(e) => { e.preventDefault(); exec('italic') }}><Italic size={15} /></button>
        <button type="button" className={'rte-b' + (active.ul ? ' on' : '')} aria-label="Bullet list" aria-pressed={active.ul} onMouseDown={(e) => { e.preventDefault(); exec('insertUnorderedList') }}><List size={15} /></button>
      </div>
      <div
        ref={ref}
        className="rte-area"
        contentEditable
        suppressContentEditableWarning
        data-ph={placeholder}
        onInput={sync}
        onKeyUp={refreshActive}
        onMouseUp={refreshActive}
      />
      <div className={'rte-foot' + (over ? ' over' : '')}>{len}/{maxLength}</div>
    </div>
  )
}
