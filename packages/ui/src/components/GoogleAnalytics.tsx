'use client'

// Google Analytics 4 (gtag.js) with Consent Mode v2.
//
// Single source for GA across all four apps. Pass the measurement ID from
// `process.env.NEXT_PUBLIC_GA_ID` (inlined per-app at build). Renders nothing
// when the ID is absent, so previews / CI without the env var stay clean.
//
// Consent Mode v2:
//   • requireConsent = true  → analytics/ads storage default to "denied" until
//     the visitor accepts via the cookie banner. Use on public surfaces that
//     show a consent banner (marketing).
//   • requireConsent = false → storage granted by default. Use on authenticated
//     apps (creator / partner / admin) where there is no banner and tracking is
//     covered by the account agreement.
//
// The cookie banner records the choice in localStorage under CONSENT_KEY and
// calls `window.gtag('consent', 'update', …)` live; on repeat visits the
// bootstrap script below replays the stored choice before the tag fires.

import Script from 'next/script'

export const GA_CONSENT_KEY = 'ilf-cookie-consent'

export interface GoogleAnalyticsProps {
  /** GA4 measurement ID, e.g. "G-XXXXXXX". Usually process.env.NEXT_PUBLIC_GA_ID. */
  gaId?: string
  /** Gate storage behind cookie-banner consent (public surfaces only). */
  requireConsent?: boolean
}

export function GoogleAnalytics({ gaId, requireConsent = false }: GoogleAnalyticsProps) {
  if (!gaId) return null

  const defaultState = requireConsent ? 'denied' : 'granted'

  return (
    <>
      {/* Bootstrap: dataLayer + Consent Mode defaults. Runs before config so
          the denial (if any) is honored the moment the tag loads. */}
      <Script id="ga-consent-default" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('consent', 'default', {
            ad_storage: '${defaultState}',
            ad_user_data: '${defaultState}',
            ad_personalization: '${defaultState}',
            analytics_storage: '${defaultState}',
          });
          ${
            requireConsent
              ? `try {
            var stored = localStorage.getItem('${GA_CONSENT_KEY}');
            if (stored) {
              var choice = JSON.parse(stored);
              var granted = choice && choice.accepted ? 'granted' : 'denied';
              gtag('consent', 'update', {
                ad_storage: granted,
                ad_user_data: granted,
                ad_personalization: granted,
                analytics_storage: granted,
              });
            }
          } catch (e) {}`
              : ''
          }
        `}
      </Script>

      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
        strategy="afterInteractive"
      />

      <Script id="ga-gtag" strategy="afterInteractive">
        {`
          gtag('js', new Date());
          gtag('config', '${gaId}');
        `}
      </Script>
    </>
  )
}
