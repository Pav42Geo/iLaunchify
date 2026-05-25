'use client'

// Hero photo + (future) gallery editor.
// Per docs/MANUFACTURER_PRODUCT_BUILDER.md §4.3 (⑦) + #132.
//
// V1 ships single hero image upload. Multi-image gallery + reorder is a
// follow-up — keeps the editor cohesive without ballooning this commit.

import { useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@ilaunchify/ui'
import { toast } from 'sonner'
import { Upload, FileImage } from 'lucide-react'
import { uploadProductHero } from '../card-actions'

interface MediaCardProps {
  productTemplateId: string
  isDraft: boolean
  currentHeroAssetId: string | null
}

export function MediaCard({ productTemplateId, isDraft, currentHeroAssetId }: MediaCardProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

  function handleFile(file: File) {
    startTransition(async () => {
      const fd = new FormData()
      fd.set('productTemplateId', productTemplateId)
      fd.set('file', file)
      const result = await uploadProductHero(fd)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Hero image uploaded')
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
        }}
        disabled={!isDraft || isPending}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={!isDraft || isPending}
        className="flex w-full items-center gap-3 rounded-md border-2 border-dashed border-zinc-300 bg-zinc-50 p-4 text-left transition-colors hover:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {currentHeroAssetId ? (
          <>
            <FileImage className="h-5 w-5 text-emerald-600" />
            <div className="flex-1 text-sm">
              <div className="font-medium text-zinc-900">Hero image uploaded</div>
              <div className="text-xs text-zinc-500">
                Click to replace with a new photo.
              </div>
            </div>
          </>
        ) : (
          <>
            <Upload className="h-5 w-5 text-zinc-400" />
            <div className="flex-1 text-sm">
              <div className="font-medium text-zinc-900">Upload hero image</div>
              <div className="text-xs text-zinc-500">PNG, JPEG, WebP · up to 10 MB</div>
            </div>
          </>
        )}
      </button>
      <p className="text-xs text-zinc-500">
        💡 The hero image shows on the creator marketplace card + product detail page.
        Multi-photo galleries ship in a follow-up.
      </p>
    </div>
  )
}
