#!/usr/bin/env bash
# Fetch the 3 newly-verified FREE official organic seals (2026-07-05 catalog expansion).
# All URLs are the issuing bodies' own official download links (see SOURCES.md).
# Idempotent + resumable: skips files that already exist, retries once, never aborts.
# Run from anywhere:  bash fetch-2026-07-05-seals.sh
cd "$(dirname "$0")"
FAIL=0
get() { # get <url> <dest>
  [ -s "$2" ] && { echo "skip  $2"; return 0; }
  curl -fL --retry 2 --retry-delay 2 "$1" -o "$2" && echo "ok    $2" || { echo "FAIL  $2  <-  $1"; FAIL=$((FAIL+1)); rm -f "$2"; }
}

# ---- Real Organic Project (PNG only — no public vector master) ----
mkdir -p real-organic-project/png-official
base="https://realorganicproject.org/wp-content/uploads/2023/04"
get "$base/cropped-ROP-Logo_CLEANED-UP.png"    real-organic-project/png-official/rop-logo-color-border.png
get "$base/ROP-Logo_CLEANED-UP_no-border.png"  real-organic-project/png-official/rop-logo-color-no-border.png
get "$base/ROP-Logo_CLEANED-UP_white-band.png" real-organic-project/png-official/rop-logo-white-band.png
get "$base/ROP-Logo_CLEANED-UP_bw.png"         real-organic-project/png-official/rop-logo-bw.png

# ---- MOSA Certified Organic + MOSA Non-GMO (PNG + EPS vector masters) ----
mkdir -p mosa/eps mosa/png-official
m="https://mosaorganic.org/assets/logos"
get "$m/MOSA_CertOrg_Logo_CMYK.eps"           mosa/eps/MOSA_CertOrg_Logo_CMYK.eps
get "$m/MOSA_CertOrg_Logo_CMYK.png"           mosa/png-official/MOSA_CertOrg_Logo_CMYK.png
get "$m/MOSA_CertOrg_Logo_BW.eps"             mosa/eps/MOSA_CertOrg_Logo_BW.eps
get "$m/MOSA-certified-organic-mono.png"      mosa/png-official/MOSA_CertOrg_Logo_BW.png
get "$m/MOSA_CertOrg_Logo_REVERSED.eps"       mosa/eps/MOSA_CertOrg_Logo_REVERSED.eps
get "$m/MOSA_CertOrg_Logo_REVERSED.png"       mosa/png-official/MOSA_CertOrg_Logo_REVERSED.png
get "$m/MOSA_CertOrg_Logo_CMYKwREVFRAME.eps"  mosa/eps/MOSA_CertOrg_Logo_CMYKwREVFRAME.eps
get "$m/MOSA_CertOrg_Logo_CMYKwREVFRAME.png"  mosa/png-official/MOSA_CertOrg_Logo_CMYKwREVFRAME.png
get "$m/MOSA_NonGMO_CMYK.eps"                 mosa/eps/MOSA_NonGMO_CMYK.eps
get "$m/MOSA_NonGMO_CMYK-1.png"               mosa/png-official/MOSA_NonGMO_CMYK.png
get "$m/MOSA_NonGMO_BW.eps"                   mosa/eps/MOSA_NonGMO_BW.eps
get "$m/MOSA_NonGMO_BW-1.png"                 mosa/png-official/MOSA_NonGMO_BW.png
get "$m/MOSA_NonGMO_REVERSED.eps"             mosa/eps/MOSA_NonGMO_REVERSED.eps
get "$m/MOSA_NonGMO_REVERSED.png"             mosa/png-official/MOSA_NonGMO_REVERSED.png
get "$m/MOSA_NonGMO_CMYKwREVFRAME.eps"        mosa/eps/MOSA_NonGMO_CMYKwREVFRAME.eps
get "$m/MOSA_NonGMO_CMYKwREVFRAME.png"        mosa/png-official/MOSA_NonGMO_CMYKwREVFRAME.png

# ---- WSDA Organic + Transitional (PNG + EPS vector masters) ----
mkdir -p wsda/eps wsda/png-official
w="https://cms.agr.wa.gov/WSDAKentico/Documents/FSCS/Organic/seals"
for f in WSDA-Organic-Color WSDA-Organic-BW OrganicTransitionalSeal-2018-Color OrganicTransitionalSeal-2018-BW; do
  get "$w/$f.eps" "wsda/eps/$f.eps"
  get "$w/$f.png" "wsda/png-official/$f.png"
done

echo "----"
echo "$(find real-organic-project mosa wsda -type f | wc -l | tr -d ' ')/28 files present, $FAIL failed this run."
