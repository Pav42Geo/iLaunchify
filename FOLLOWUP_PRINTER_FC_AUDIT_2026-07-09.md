# Follow-up — Printer & Fulfillment-Center activation audit (2026-07-09)

**Status: BLOCKED on live verification.** The local CockroachDB (`localhost:26257`) went
down mid-audit, so the running app can't be exercised. All code paths below are
**statically confirmed green**; what remains is eyeball confirmation once the DB is back.

This continues the co-packer activation-surface audit (already done + committed through
`f51c7f9f`). The printer and fulfillment-center (FC) roles reuse the exact same role-aware
machinery, so no new code is expected — only verification.

---

## Already confirmed statically (no DB needed)

- **Role labels resolve correctly** via `rolePrefix` precedence (`apps/partner/src/lib/role-skins.ts`):
  - Printer (`LABEL_PRINTING`) → eyebrow reads **"Print production · …"**
  - FC (`WAREHOUSE`) → eyebrow reads **"Fulfillment Center · …"**
- **Limited activation nav is role-aware** (`limitedActivationNav`, `PartnerSidebar.tsx`):
  - Printer: no Products (not producing); Packaging shows (offers packaging/print).
  - FC: no Products, **no Packaging** (offers neither) → Activation Setup, Certifications,
    Services, Settings, Support only.
- **No stray manufacturer-framed copy** on printer/FC surfaces. The "manufacturer" mentions
  in `/inventory`, `/outbound`, `/standing`, `/capability-requests`, `/billing` are all
  legitimate (the `HOLD_AT_MANUFACTURER` enum label, `standing` being genuinely
  manufacturing-only with its own guard, capability-requests correctly citing manufacturers
  as the *source* of print jobs).
- **KPI strips**: every real strip fixed (offerings, dielines, accessories, mandatory-phrases).
  Only the `_widget-preview` admin sandbox still uses `md:grid-cols-5` (intentional).

## Live checklist — run when the DB is back

Bring the DB up first (your setup's exact command), then dev-login to each account.

**Printer** — `sample-print@ilaunchify.dev` (LABEL_PRINTING only)
```
http://localhost:3002/api/dev/login?email=sample-print@ilaunchify.dev&callbackUrl=/services
```
- [ ] Eyebrows read **"Print production · …"** on /services, /certifications, /settings.
- [ ] Nav has **no Products**; Packaging present (materials/substrates live there).
- [ ] `/print-spec` (Prepress) + `/capability-requests` render cleanly; KPI strips are 5-across.
- [ ] `/activation` shows the Packaging-printing track (materials, print specs, die-lines, run sizes).

**Fulfillment Center** — `fc-dryrun@ilaunchify.dev` (WAREHOUSE only)
```
http://localhost:3002/api/dev/login?email=fc-dryrun@ilaunchify.dev&callbackUrl=/services
```
- [ ] Eyebrows read **"Fulfillment Center · …"**.
- [ ] Nav has **no Products and no Packaging** (FC offers neither).
- [ ] `/inbound`, `/inventory`, `/outbound`, `/billing` render cleanly (layout + KPI strips).
- [ ] `/activation` shows the Fulfillment track (storage classes, capacity & geo, value-added services).

## If a live issue turns up

The likely classes are the same two already fixed for the co-packer — a hardcoded eyebrow
(use `getPartnerRoleWord()` / `rolePrefix`) or a KPI strip using `md:grid-cols-5` instead of
`lg:grid-cols-5` + `span={1}`. Anything role-specific beyond that would be a new finding.
