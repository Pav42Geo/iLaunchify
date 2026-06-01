import { CategoryHub } from '@/components/hub/CategoryHub'

export const metadata = { title: 'Settings — Admin' }

export default function SettingsHubPage() {
  return (
    <CategoryHub
      label="Settings"
      subtitle="Subscription plans, billing, security, developer access, audit trail, and analytics."
    />
  )
}
