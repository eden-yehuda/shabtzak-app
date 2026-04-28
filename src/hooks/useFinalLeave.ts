import { useEffect, useState } from 'react'
import { onSnapshot, query, where } from 'firebase/firestore'
import { leaveRequestsRef } from '@/lib/firestore'
import type { LeaveRequest } from '@/types'

export function useFinalLeave(): LeaveRequest[] {
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  useEffect(() => {
    const q = query(leaveRequestsRef(), where('is_final', '==', true))
    return onSnapshot(q, snap => {
      setRequests(snap.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          ...data,
          is_final: data.is_final ?? true,
          created_at: data.created_at?.toDate() ?? new Date(),
        } as LeaveRequest
      }))
    })
  }, [])
  return requests
}
