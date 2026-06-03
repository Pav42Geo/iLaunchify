// P10 — partner consent text shown before uploading a certificate PDF.
// Bump the version string whenever the wording changes; the accepted version is
// stamped on each PartnerCertificateInstance (consentVersion) for auditability.

export const CERT_UPLOAD_CONSENT_VERSION = '2026-06'

export const CERT_UPLOAD_CONSENT_TEXT =
  'By uploading, I confirm this certificate is genuine and currently valid. iLaunchify ' +
  'stores it privately and encrypted, accessible only to iLaunchify admin for verification ' +
  '— public pages show only the verified badge. I can request deletion at any time per the ' +
  'DPA. The document is retained for 7 years after the certificate expires.'
