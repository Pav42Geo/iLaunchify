import { CategoryHub } from '@/components/hub/CategoryHub'

export const metadata = { title: 'Manage — Admin' }

export default function ManageHubPage() {
  return (
    <CategoryHub
      label="Manage"
      subtitle="Catalog, people, assets, communications, market profiles, and AI tooling — every operational surface in one hub."
    />
  )
}
