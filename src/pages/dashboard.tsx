import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '@/components/layout/Layout'
import NextTaskCard from '@/components/soldier/NextTaskCard'
import TaskList from '@/components/soldier/TaskList'
import LeaveList from '@/components/soldier/LeaveList'
import { useSoldiers } from '@/hooks/useSoldiers'
import { useScheduleTasks } from '@/hooks/useSchedule'
import { useLeaveRequests } from '@/hooks/useLeaveRequests'
import { onSnapshot, query, where, orderBy, limit } from 'firebase/firestore'
import { schedulesRef } from '@/lib/firestore'

export default function Dashboard() {
  const router = useRouter()
  const [soldierId, setSoldierId] = useState<string | null>(null)
  const [soldierName, setSoldierName] = useState('')
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(null)

  const soldiers = useSoldiers()
  const { tasks, assignments } = useScheduleTasks(activeScheduleId)
  const leaveRequests = useLeaveRequests(soldierId ?? undefined)

  useEffect(() => {
    const id = localStorage.getItem('soldierId')
    const name = localStorage.getItem('soldierName')
    if (!id) { router.replace('/'); return }
    setSoldierId(id)
    setSoldierName(name ?? '')
  }, [router])

  useEffect(() => {
    const q = query(
      schedulesRef(),
      where('status', '==', 'published'),
      orderBy('start_datetime', 'desc'),
      limit(1)
    )
    return onSnapshot(q, snap => {
      setActiveScheduleId(snap.docs[0]?.id ?? null)
    })
  }, [])

  if (!soldierId) return null

  return (
    <Layout title={`שלום, ${soldierName}`}>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold text-navy">שלום, {soldierName}</h1>
        <button
          onClick={() => { localStorage.removeItem('soldierId'); localStorage.removeItem('soldierName'); router.push('/') }}
          className="text-sm text-slate-400 hover:text-slate-600"
        >
          החלף
        </button>
      </div>

      <NextTaskCard tasks={tasks} assignments={assignments} soldierId={soldierId} soldiers={soldiers} />

      <section className="mb-6">
        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">המשימות שלי</h2>
        <TaskList tasks={tasks} assignments={assignments} soldierId={soldierId} />
      </section>

      <div className="mt-4 mb-6 text-center">
        <Link href="/schedule" className="text-sm text-navy underline">
          {'צפה בשבצ"ק המחלקתי המלא'}
        </Link>
      </div>

      <section className="mb-6">
        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3">בקשות יציאה</h2>
        <LeaveList requests={leaveRequests} />
        <Link href="/leave/new">
          <button className="w-full mt-3 bg-navy text-white rounded-xl py-3 font-semibold hover:bg-navy-light transition">
            + בקשת יציאה חדשה
          </button>
        </Link>
      </section>
    </Layout>
  )
}
