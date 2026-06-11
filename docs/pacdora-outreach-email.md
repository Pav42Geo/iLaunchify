# Outreach email → Pacdora (Rinke Lee, API Business Leader)

Copy/paste-ready. Fill the two bracketed placeholders before sending.

---

**To:** business@pacdora.com (attn: Rinke Lee, API Business Leader)
**Subject:** API + licensing questions — iLaunchify (CPG production marketplace) evaluating Pacdora

Hi Rinke,

I'm Pavel, founder of **iLaunchify** — a B2B production marketplace for CPG
creators. Manufacturers on our platform define products and their packaging,
creators then design the labels/artwork, and we route production to the right
partners. We're building a 3D Packaging Studio where a user picks a package, sees
it in 3D, and clicks a surface to design that face's label — and Pacdora's
die-line + 3D mockup library is the best fit we've found to power the packaging
side.

So you can answer precisely, here's our intended usage: **primarily we'd use your
die-lines and 3D mockups/renders as packaging previews and production reference
inside our product-building flow, under a Business subscription** — not reselling
your templates as standalone products. We're also evaluating a deeper API
integration, and separately whether to embed your interactive 3D files directly
(noted at the end as an optional path).

**Core question for our near-term plan**

1. Under the Business plan's commercial-use license, can we use **downloaded
   die-lines and rendered 3D mockup images/videos as previews + production
   reference inside our SaaS** (shown to our partners and creators, not sold
   separately)? Is that squarely within "commercial use," or does our being a
   multi-user platform change how you'd license it?

**API + integration (evaluating)**

2. Does the Editor API return **structured die-line geometry** — panels,
   crease/fold lines, fold angles, per-surface coordinates — as data (JSON/SVG),
   or only rendered images + AI/PDF/DXF file exports?
3. Is the **3D consumable as data** (glTF / parameters) we could load into our own
   three.js scene, or only through your hosted viewer / rendered images + video?
4. **Custom structures:** can we submit a new package (dimensions + reference) and
   get a generated die-line + 3D back programmatically? (For our "I can't find my
   packaging" requests.)
5. **Quoting:** are your print-area / die-line-length / color-count calculations
   available via API?

**Commercial + legal**

6. **Pricing** for API / enterprise use, and the model — per-seat, per-render,
   per-call, or revenue-share?
7. **Data & IP ownership** of die-lines and designs our users create via your
   tools — do we/they own them, and can we store + reuse them within our platform?
8. **SLA, rate limits, uptime**, and your policy on pricing changes — important for
   a production dependency.

**Additional option (only if we pursue it)**

9. Should we decide to **embed your interactive 3D model files (glTF) directly in
   our web app** — for our users to rotate and fold as previews, not sold and not
   separately charged — is that permitted under the Business plan, or would it
   require an enterprise / redistribution license? If the latter, what does that
   arrangement and pricing look like?

To move quickly, could you share your **API documentation** and a **sandbox/trial
key** so we can run a short technical evaluation? Happy to hop on a call at your
convenience.

Thanks,
Pavel
Founder, iLaunchify
[your email] · [iLaunchify URL]
