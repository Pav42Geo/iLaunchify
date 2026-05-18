import { requireRole } from '@ilaunchify/auth'
import { AdminSidebar } from '@/components/nav/AdminSidebar'
import { AdminTopbar } from '@/components/nav/AdminTopbar'

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole('ADMIN')

  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <div className="flex flex-1 flex-col">
        <AdminTopbar user={user} />
        <main className="flex-1 overflow-y-auto bg-zinc-50 p-6">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
