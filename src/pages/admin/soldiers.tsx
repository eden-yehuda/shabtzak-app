import AdminLayout from '@/components/layout/AdminLayout'
import SoldiersTable from '@/components/admin/SoldiersTable'
import { useSoldiers } from '@/hooks/useSoldiers'

export default function SoldiersPage() {
  const soldiers = useSoldiers(false)
  return (
    <AdminLayout>
      <h1 className="text-xl font-bold text-navy mb-6">ניהול כוח אדם</h1>
      <SoldiersTable soldiers={soldiers} />
    </AdminLayout>
  )
}
