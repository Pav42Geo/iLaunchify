import Stripe from 'stripe'

declare global {
  // eslint-disable-next-line no-var
  var __ilaunchifyStripe: Stripe | undefined
}

function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error(
      'STRIPE_SECRET_KEY is not set. Add it to your environment before calling Stripe APIs.',
    )
  }
  if (globalThis.__ilaunchifyStripe) return globalThis.__ilaunchifyStripe
  const client = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-10-28.acacia',
    typescript: true,
    appInfo: { name: 'iLaunchify', version: '0.1.0' },
  })
  if (process.env.NODE_ENV !== 'production') {
    globalThis.__ilaunchifyStripe = client
  }
  return client
}

// Lazy proxy so importing this module doesn't throw at boot
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return Reflect.get(getStripe() as unknown as object, prop as PropertyKey)
  },
})
