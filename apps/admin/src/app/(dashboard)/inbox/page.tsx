import { CategoryHub } from '@/components/hub/CategoryHub'

export const metadata = { title: 'Inbox — Admin' }

export default function InboxHubPage() {
  return (
    <CategoryHub
      label="Inbox"
      subtitle="Every queue that needs human review. Click a tile to jump straight into the work."
    />
  )
}
