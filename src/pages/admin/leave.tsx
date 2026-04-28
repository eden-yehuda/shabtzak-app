import { useState, useMemo } from 'react'
import AdminLayout from '@/components/layout/AdminLayout'
import { useSoldiers } from '@/hooks/useSoldiers'
import { useLeaveRequests } from '@/hooks/useLeaveRequests'
import { useFinalLeave } from '@/hooks/useFinalLeave'
import { addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore'
import { leaveRequestsRef, updateLeaveStatus } from '@/lib/firestore'
import { db } from '@/lib/firebase'
import type { Soldier } from '@/types'

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

function dayLabel(dateStr: string) {
  const d = new Date(dateStr)
  const days = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
  return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}

export default function AdminLeavePage() {
  const soldiers = useSoldiers(false)
  const pending = useLeaveRequests()
  const finalLeave = useFinalLeave()
  const dates = useMemo(() => next14Days(), [])
  const [tab, setTab] = useState<'requests' | 'final'>('final')

  const sorted = useMemo(() =>
    [...soldiers].filter(s => s.is_active).sort((a, b) => a.full_name.localeCompare(b.full_name, 'he')),
    [soldiers]
  )

  async function toggleFinal(soldier: Soldier, date: string) {
    const existing = finalLeave.find(r => r.soldier_id === soldier.id && r.date === date)
    if (existing) {
      await deleteDoc(doc(db, 'leave_requests', existing.id))
    } else {
      await addDoc(leaveRequestsRef(), {
        soldier_id: soldier.id,
        date,
        status: 'approved',
        is_final: true,
        created_at: new Date(),
      })
    }
  }

  const requests = pending.filter(r => !r.is_final)

  async function approveRequest(requestId: string) {
    await updateDoc(doc(db, 'leave_requests', requestId), {
      is_final: true,
      status: 'approved',
    })
  }

  async function rejectRequest(requestId: string) {
    await updateLeaveStatus(requestId, 'rejected', 'admin')
  }

  function countFinal(date: string) {
    return finalLeave.filter(r => r.date === date && r.status === 'approved').length
  }

  function presentCount(date: string) {
    return soldiers.filter(s => s.is_active).length - countFinal(date)
  }

  return (
    <AdminLayout>
      <h1 className="text-xl font-bold text-navy mb-4">ניהול יציאות</h1>

      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab('final')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === 'final' ? 'bg-navy text-white' : 'bg-slate-100'}`}>
          יציאות סופי
        </button>
        <button onClick={() => setTab('requests')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === 'requests' ? 'bg-navy text-white' : 'bg-slate-100'}`}>
          בקשות ממתינות ({requests.filter(r => r.status === 'pending').length})
        </button>
      </div>

      {tab === 'final' && (
        <div className="overflow-x-auto">
          <table className="text-sm border-collapse min-w-full">
            <thead>
              <tr className="text-right bg-slate-50">
                <th className="px-3 py-2 sticky right-0 bg-slate-50">שם</th>
                {dates.map(d => (
                  <th key={d} className="px-2 py-2 text-center min-w-[52px]">{dayLabel(d)}</th>
                ))}
                <th className="px-2 py-2 text-center">סה&quot;כ</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(s => {
                const myCount = dates.filter(d =>
                  finalLeave.some(r => r.soldier_id === s.id && r.date === d)
                ).length
                return (
                  <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium sticky right-0 bg-white">
                      {s.full_name}
                      {s.is_commander && <span className="text-xs text-navy mr-1">★</span>}
                    </td>
                    {dates.map(d => {
                      const approved = finalLeave.some(r => r.soldier_id === s.id && r.date === d)
                      const rejected = requests.some(r => r.soldier_id === s.id && r.date === d && r.status === 'rejected')
                      const requested = requests.some(r => r.soldier_id === s.id && r.date === d && r.status === 'pending')
                      return (
                        <td key={d} className="px-1 py-1 text-center">
                          <button
                            disabled={rejected}
                            onClick={() => toggleFinal(s, d)}
                            title={requested && !approved ? 'ביקש יציאה' : rejected ? 'נדחה' : ''}
                            className={`w-8 h-8 rounded-lg text-xs font-bold transition ${
                              approved
                                ? 'bg-green-500 text-white'
                                : rejected
                                ? 'bg-slate-300 text-slate-500 disabled:cursor-default'
                                : requested
                                ? 'bg-blue-100 text-blue-700 border border-blue-300'
                                : 'bg-white hover:bg-slate-100 text-slate-300'
                            }`}
                          >
                            {approved ? '✓' : rejected ? '✕' : requested ? '?' : ''}
                          </button>
                        </td>
                      )
                    })}
                    <td className="px-2 py-2 text-center text-xs font-semibold">{myCount}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                <td className="px-3 py-2 sticky right-0 bg-slate-50">בבית</td>
                {dates.map(d => (
                  <td key={d} className="px-1 py-2 text-center">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                      countFinal(d) >= 8 ? 'bg-red-100 text-red-700' :
                      countFinal(d) >= 6 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-green-100 text-green-700'
                    }`}>{countFinal(d)}</span>
                  </td>
                ))}
                <td />
              </tr>
              <tr className="bg-slate-50">
                <td className="px-3 py-2 sticky right-0 bg-slate-50 text-slate-500 text-xs">נוכחים</td>
                {dates.map(d => (
                  <td key={d} className="px-1 py-2 text-center text-xs text-slate-500">{presentCount(d)}</td>
                ))}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {tab === 'requests' && (
        <div className="space-y-2">
          {requests.filter(r => r.status === 'pending').length === 0 && <p className="text-slate-400 text-center py-8">אין בקשות ממתינות</p>}
          {requests
            .filter(r => r.status === 'pending')
            .map(r => {
              const soldier = soldiers.find(s => s.id === r.soldier_id)
              return (
                <div key={r.id} className="bg-white rounded-xl p-3 border border-slate-200 flex justify-between items-center">
                  <div>
                    <span className="font-semibold">{soldier?.full_name}</span>
                    <span className="text-slate-400 text-sm mr-2">{r.date}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => approveRequest(r.id)}
                      className="bg-green-500 text-white text-xs px-3 py-1.5 rounded-lg"
                    >אשר ביציאות סופי</button>
                    <button
                      onClick={() => rejectRequest(r.id)}
                      className="bg-red-100 text-red-700 text-xs px-3 py-1.5 rounded-lg border border-red-200"
                    >דחה</button>
                  </div>
                </div>
              )
            })}
        </div>
      )}
    </AdminLayout>
  )
}
