// P10 — partner consent text shown before uploading a certificate PDF.
// Bump the version string whenever the wording changes; the accepted version is
// stamped on each PartnerCertificateInstance (consentVersion) for auditability.

export const CERT_UPLOAD_CONSENT_VERSION = '2026-06'

export const CERT_UPLOAD_CONSENT_TEXT =
  'I confirm I am authorized to share this certificate, that the document is accurate, ' +
  'and I consent to iLaunchify storing it and processing it solely to verify my ' +
  'certifications. iLaunchify keeps the PDF private — only iLaunchify staff review it; ' +
  'public pages show only the verified badge.'
