import { useEffect, useState } from 'react'
import { onSnapshot, query, where } from 'firebase/firestore'
import { soldiersRef } from '@/lib/firestore'
import type { Soldier } from '@/types'

export function useSoldiers(activeOnly = true): Soldier[] {
  const [soldiers, setSoldiers] = useState<Soldier[]>([])

  useEffect(() => {
    const q = activeOnly
      ? query(soldiersRef(), where('is_active', '==', true))
      : soldiersRef()
    return onSnapshot(q, snap => {
      setSoldiers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Soldier)))
    })
  }, [activeOnly])

  return soldiers
}
