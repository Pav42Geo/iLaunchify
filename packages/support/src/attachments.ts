// Shared shape for ticket reply attachments. Stored on TicketReply.attachments
// (Json) as an array of these. The R2 key is private — files are served through
// an access-checked signed-URL route, never linked directly.

export interface AttachmentMeta {
  key: string // R2 object key
  name: string // original filename (display)
  mimeType: string
  size: number // bytes
}

/** Safely coerce a TicketReply.attachments Json value into AttachmentMeta[]. */
export function parseAttachments(json: unknown): AttachmentMeta[] {
  if (!Array.isArray(json)) return []
  const out: AttachmentMeta[] = []
  for (const a of json) {
    if (
      a &&
      typeof a === 'object' &&
      typeof (a as AttachmentMeta).key === 'string' &&
      typeof (a as AttachmentMeta).name === 'string'
    ) {
      const m = a as AttachmentMeta
      out.push({ key: m.key, name: m.name, mimeType: m.mimeType ?? 'application/octet-stream', size: Number(m.size) || 0 })
    }
  }
  return out
}

/** True if `key` is among any of the attachment arrays (download authorization). */
export function attachmentKeyAllowed(key: string, attachmentArrays: unknown[]): boolean {
  return attachmentArrays.some((arr) => parseAttachments(arr).some((a) => a.key === key))
}
