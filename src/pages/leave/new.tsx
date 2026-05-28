import { useState, useMemo, useEffect } from 'react'
import Layout from '@/components/layout/Layout'
import LeaveGrid from '@/components/leave/LeaveGrid'
import { useSoldiers } from '@/hooks/useSoldiers'
import { useLeaveRequests } from '@/hooks/useLeaveRequests'
import { addDoc, deleteDoc, doc } from 'firebase/firestore'
import { leaveRequestsRef } from '@/lib/firestore'
import { db } from '@/lib/firebase'

function next14Days(): string[] {
  const days: string[] = []
  const today = new Date()
  for (let i = 0; i < 14; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    days.push(d.toISOString().split('T')[0])
  }
  return days
}

export default function LeaveRequestPage() {
  const soldiers = useSoldiers()
  const allRequests = useLeaveRequests()
  const requests = allRequests.filter(r => !r.is_final)
  const dates = useMemo(() => next14Days(), [])

  const [currentSoldierId, setCurrentSoldierId] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('soldierId')
      if (saved) setCurrentSoldierId(saved)
    }
  }, [])

  async function handleToggle(soldierId: string, date: string) {
    const existing = requests.find(r => r.soldier_id === soldierId && r.date === date && r.status !== 'rejected')
    if (existing) {
      await deleteDoc(doc(db, 'leave_requests', existing.id))
    } else {
      await addDoc(leaveRequestsRef(), {
        soldier_id: soldierId,
        date,
        status: 'pending',
        is_final: false,
        created_at: new Date(),
      })
    }
  }

  const sortedSoldiers = useMemo(() =>
    [...soldiers].filter(s => s.is_active).sort((a, b) => {
      if (a.is_commander !== b.is_commander) return a.is_commander ? -1 : 1
      return a.full_name.localeCompare(b.full_name, 'he')
    }),
    [soldiers]
  )

  return (
    <Layout title="בקשות יציאה">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-navy mb-2">בקשות יציאה</h1>
        <p className="text-sm text-slate-500 mb-3">לחץ על הימים שאתה מבקש לצאת. עד 5 ימים בשבועיים, כולל שישי ושבת אחד.</p>
        <select
          value={currentSoldierId ?? ''}
          onChange={e => {
            const val = e.target.value || null
            setCurrentSoldierId(val)
            if (val) localStorage.setItem('soldierId', val)
          }}
          className="border border-slate-300 rounded-xl px-4 py-2 text-sm mb-4"
        >
          <option value="">— בחר את שמך —</option>
          {sortedSoldiers.map(s => (
            <option key={s.id} value={s.id}>{s.full_name}</option>
          ))}
        </select>
      </div>
      <LeaveGrid
        soldiers={soldiers}
        requests={requests}
        dates={dates}
        currentSoldierId={currentSoldierId}
        onToggle={handleToggle}
      />
    </Layout>
  )
}
