import { useEffect, useState } from 'react'
import { onSnapshot, query, where } from 'firebase/firestore'
import { leaveRequestsRef } from '@/lib/firestore'
import type { LeaveRequest } from '@/types'

export function useLeaveRequests(soldierId?: string): LeaveRequest[] {
  const [requests, setRequests] = useState<LeaveRequest[]>([])

  useEffect(() => {
    const q = soldierId
      ? query(leaveRequestsRef(), where('soldier_id', '==', soldierId))
      : leaveRequestsRef()
    return onSnapshot(q, snap => {
      setRequests(snap.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          ...data,
          created_at: data.created_at?.toDate() ?? new Date(),
        } as LeaveRequest
      }))
    })
  }, [soldierId])

  return requests
}

export function useLeaveCountByDate(): Record<string, number> {
  const all = useLeaveRequests()
  const counts: Record<string, number> = {}
  for (const r of all) {
    if (r.status !== 'rejected') {
      counts[r.date] = (counts[r.date] || 0) + 1
    }
  }
  return counts
}
