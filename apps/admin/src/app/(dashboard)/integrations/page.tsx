import { CategoryHub } from '@/components/hub/CategoryHub'

export const metadata = { title: 'Integrations & API — Admin' }

export default function IntegrationsHubPage() {
  return (
    <CategoryHub
      label="Integrations & API"
      subtitle="Connected channels, marketing pixel integrations, and analytics relay."
    />
  )
}
