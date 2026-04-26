import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/layout/Layout'
import { useLeaveCountByDate } from '@/hooks/useLeaveRequests'
import { createLeaveRequest } from '@/lib/firestore'
import { dateToKey } from '@/utils/dateUtils'

const LEAVE_QUOTA = 8

export default function NewLeaveRequest() {
  const router = useRouter()
  const [soldierId, setSoldierId] = useState<string | null>(null)
  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const leaveCountByDate = useLeaveCountByDate()

  useEffect(() => {
    const id = localStorage.getItem('soldierId')
    if (!id) { router.replace('/'); return }
    setSoldierId(id)
  }, [router])

  // Build next 30 days
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    return dateToKey(d)
  })

  function toggleDate(key: string) {
    setSelectedDates(prev =>
      prev.includes(key) ? prev.filter(d => d !== key) : [...prev, key]
    )
  }

  async function submit() {
    if (!soldierId || selectedDates.length === 0) return
    setSubmitting(true)
    await Promise.all(selectedDates.map(date => createLeaveRequest(soldierId, date)))
    router.push('/dashboard')
  }

  if (!soldierId) return null

  return (
    <Layout title="בקשת יציאה">
      <h1 className="text-xl font-bold text-navy mb-2">בקשת יציאה</h1>
      <p className="text-slate-500 text-sm mb-6">בחר את הימים בהם תרצה לצאת הביתה</p>

      <div className="grid grid-cols-3 gap-2 mb-6">
        {days.map(key => {
          const count = leaveCountByDate[key] || 0
          const isFull = count >= LEAVE_QUOTA
          const isSelected = selectedDates.includes(key)
          const d = new Date(key + 'T12:00:00Z')
          const label = `${d.getUTCDate()}/${d.getUTCMonth() + 1}`

          return (
            <button
              key={key}
              onClick={() => toggleDate(key)}
              className={`rounded-xl p-3 text-center border-2 transition text-sm font-medium
                ${isSelected ? 'border-navy bg-navy text-white' : 'border-slate-200 bg-white'}
                ${isFull && !isSelected ? 'border-red-200' : ''}
              `}
            >
              <div>{label}</div>
              {isFull && !isSelected && (
                <div className="text-xs text-red-500 mt-0.5">⚠ מלא ({count})</div>
              )}
              {isFull && isSelected && (
                <div className="text-xs opacity-80 mt-0.5">⚠ {count}/8</div>
              )}
              {!isFull && count > 0 && (
                <div className="text-xs opacity-60 mt-0.5">{count}/8</div>
              )}
            </button>
          )
        })}
      </div>

      {selectedDates.some(d => (leaveCountByDate[d] || 0) >= LEAVE_QUOTA) && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-3 mb-4 text-sm text-yellow-800">
          ⚠️ יום אחד או יותר כבר הגיע למכסה של 8 חיילים. הבקשה תישלח לאישור מיוחד.
        </div>
      )}

      <button
        onClick={submit}
        disabled={selectedDates.length === 0 || submitting}
        className="w-full bg-navy text-white rounded-xl py-3 font-semibold disabled:opacity-50"
      >
        {submitting ? 'שולח...' : `שלח בקשה (${selectedDates.length} ימים)`}
      </button>
    </Layout>
  )
}
