import { requireRole } from '@ilaunchify/auth'
import { AdminSidebar } from '@/components/nav/AdminSidebar'
import { AdminTopbar } from '@/components/nav/AdminTopbar'

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole('ADMIN')

  return (
    <div className="flex min-h-screen flex-col bg-ink-50/40">
      <AdminTopbar user={user} />
      <div className="flex min-h-0 flex-1">
        {/* AdminSidebar is an async server component — React 19 / Next 15
            awaits the promise without a type-error suppression. */}
        <AdminSidebar />
        <main className="min-w-0 flex-1 overflow-y-auto p-6 lg:p-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
