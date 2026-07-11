import type { LegalDoc } from './content'

// Hand-authored Accessibility Statement draft (kept out of the auto-generated
// content.ts). Rendered as the fallback for /accessibility until an admin
// publishes the DB-managed version in Settings → Legal, at which point the
// published version takes over automatically. Mirrors the authored body in
// packages/db/prisma/legal-content.ts. WCAG target 2.1 AA (2.2 AA best practice).

export const ACCESSIBILITY_STATEMENT: LegalDoc = {
  title: 'Accessibility Statement',
  html: [
    '<p>iLaunchify is committed to making our platform accessible to everyone, including people with disabilities. We are working to conform to the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA, and we treat WCAG 2.2 Level AA as our best-practice benchmark.</p>',
    '<h2>Conformance status</h2>',
    '<p>We are actively working toward WCAG 2.1 AA conformance across our creator, partner, and marketing surfaces. Accessibility is an ongoing effort and some areas may not yet fully conform; where we are aware of gaps, we prioritize fixes and note known limitations below.</p>',
    '<h2>Measures we take</h2>',
    '<p>We include accessibility in our design and engineering process — semantic markup, keyboard operability, visible focus states, sufficient color contrast, descriptive labels and alternative text, and compatibility with common assistive technologies. Accessibility considerations are part of our design-system tokens and component reviews.</p>',
    '<h2>Scope</h2>',
    '<p>This statement applies to the iLaunchify web applications and marketing site. It does not cover third-party content or services that we link to but do not control.</p>',
    '<h2>Known limitations</h2>',
    '<p>Some complex, interactive areas — for example the design studio canvas and certain data-dense tables — may have partial assistive-technology support while we continue improvements. We welcome reports so we can prioritize them.</p>',
    '<h2>Technologies we rely upon</h2>',
    '<p>Accessibility of the Platform relies on HTML, WAI-ARIA, CSS, and JavaScript working with your browser and any assistive technologies installed on your device. Where interactive features require JavaScript, we aim to provide accessible names, roles, states, and keyboard operability.</p>',
    '<h2>Compatibility</h2>',
    '<p>We aim for compatibility with recent versions of major browsers and common assistive technologies (such as screen readers and speech-recognition and magnification tools). Compatibility may vary with older software.</p>',
    '<h2>Feedback</h2>',
    '<p>If you encounter an accessibility barrier, or need content in an alternative format, contact us at accessibility@ilaunchify.com. Please describe the issue, the page or feature, and the assistive technology and browser you were using. We aim to acknowledge feedback promptly and to resolve issues as quickly as we reasonably can.</p>',
    '<h2>Assessment</h2>',
    '<p>We evaluate accessibility through a combination of automated testing and manual review, including keyboard-only and screen-reader checks, and we consider accessibility in design and component reviews. We update this statement as our conformance and processes evolve.</p>',
    '<h2>Escalation</h2>',
    '<p>If you are not satisfied with our response to an accessibility concern, let us know and we will escalate it internally for further review. This statement will be updated with any additional formal contact or complaint options as they become available.</p>',
  ].join('\n'),
}
