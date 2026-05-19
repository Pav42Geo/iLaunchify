import Link from 'next/link'
import type { BrandWithCreator } from '@/lib/brand'

export function StorefrontFooter({ brand }: { brand: BrandWithCreator }) {
  const year = new Date().getFullYear()
  return (
    <footer className="mt-16 border-t border-zinc-200">
      <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-zinc-600">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <div>
            <h3 className="mb-2 font-semibold text-zinc-900">{brand.name}</h3>
            <p className="text-xs">{brand.positioning ?? ''}</p>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase">Shop</h3>
            <ul className="space-y-1">
              <li>
                <Link href={`/${brand.handle}`} className="hover:underline">
                  All products
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase">Help</h3>
            <ul className="space-y-1">
              <li>
                <Link href={`/${brand.handle}/policies/shipping`} className="hover:underline">
                  Shipping
                </Link>
              </li>
              <li>
                <Link href={`/${brand.handle}/policies/returns`} className="hover:underline">
                  Returns
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase">Legal</h3>
            <ul className="space-y-1">
              <li>
                <Link href={`/${brand.handle}/policies/privacy`} className="hover:underline">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href={`/${brand.handle}/policies/terms`} className="hover:underline">
                  Terms
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-8 flex flex-col justify-between gap-2 border-t border-zinc-200 pt-4 text-xs text-zinc-500 sm:flex-row">
          <span>
            © {year} {brand.name}. Made on{' '}
            <Link href="https://ilaunchify.com" className="underline">
              iLaunchify
            </Link>
            .
          </span>
          <span>Payment processed by iLaunchify, Inc. on behalf of {brand.name}.</span>
        </div>
      </div>
    </footer>
  )
}
