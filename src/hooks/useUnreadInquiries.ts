import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * Subscribes to the inquiries collection and returns the count of unread items.
 * Unread = `read` field is missing or `false`.
 */
export function useUnreadInquiriesCount(): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    return onSnapshot(collection(db, 'inquiries'), snap => {
      const n = snap.docs.filter(d => !d.data().read).length
      setCount(n)
    })
  }, [])
  return count
}
