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
      setSoldiers(snap.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          ...data,
          is_commander: data.is_commander ?? false,
          notes: data.notes ?? '',
          fixed_home_ranges: data.fixed_home_ranges ?? [],
        } as Soldier
      }))
    })
  }, [activeOnly])

  return soldiers
}
