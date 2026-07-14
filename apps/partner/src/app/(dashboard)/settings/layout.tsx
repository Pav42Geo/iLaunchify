// Settings layout — pass-through since the merged sidebar (Pavel 2026-07-13).
// The st-topband moved into Settings → Company profile (CompanyTopband); the
// grouped rail folded into the ONE main sidebar (role-skins roleNavGroupsFor).
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
