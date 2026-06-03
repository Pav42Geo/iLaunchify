---
name: ilaunchify-partner-spec-source-of-truth
description: All print/export specs (CMYK conversion, ICC profile, TAC, fonts, dieline layer naming) read from PartnerPrintOutputSpec — never hardcoded platform defaults.
metadata:
  type: feedback
---

Pavel correction 2026-06-03 — I proposed hardcoded CMYK enforcement at export. Pavel pushed back: every partner has their own press, their own color profile, their own preferred PDF format, their own font policy. Hardcoded defaults force creators into a color space the partner might not even use.

**Why:** Some digital presses run extended-gamut CMYK+OGV. Some printers prefer RGB inputs and do their own conversion in their RIP. Some require PDF/X-1a (no transparency); others want PDF/X-4 (modern). Hardcoded one-size-fits-all breaks every partner who doesn't match the default.

**How to apply:**

- All export specs live in `PartnerPrintOutputSpec` model — color space, ICC profile, TAC limit, font policy, file format, bleed amount, dieline delivery format, spot color library (C/U/M book), special channel naming
- At export time, read the spec for the receiving partner and produce output matching THEIR config
- Pre-flight checks warn based on partner spec, not universal rules
- Same artwork might pass for Partner A and fail for Partner B — both correct
- This principle extends beyond print: every output the platform produces ON BEHALF OF a partner reads from partner-configured policy, not platform-baked defaults

**Generalization:** when adding any new partner-touching system, ask "is there a config field for this on the partner side?" If yes, read it. If no, default conservatively and add the config field. Don't hardcode behavior partners might want to override.

Related: [[ilaunchify-prepress-terminology]], [[ilaunchify-operational-philosophy-v1]]
