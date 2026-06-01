-- CertificateType gains a dedicated vector badge.
-- thumbnailFileId stays the PNG (web UI: marketplace detail + chips);
-- badgeSvgFileId is the VECTOR SVG used in the Design Studio for print/
-- production, where vector output is a hard requirement.
ALTER TABLE "CertificateType" ADD COLUMN "badgeSvgFileId" STRING;
