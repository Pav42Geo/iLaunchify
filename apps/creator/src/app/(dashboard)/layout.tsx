import { requireRole } from '@ilaunchify/auth'
import { DashboardSidebar } from '@/components/nav/DashboardSidebar'
import { DashboardTopbar } from '@/components/nav/DashboardTopbar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['CREATOR', 'ADMIN'])

  return (
    <div className="flex min-h-screen">
      <DashboardSidebar />
      <div className="flex flex-1 flex-col">
        <DashboardTopbar user={user} />
        <main className="flex-1 overflow-y-auto bg-zinc-50 p-6">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
