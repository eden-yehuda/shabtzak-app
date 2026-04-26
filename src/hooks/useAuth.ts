import { useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '@/lib/firebase'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  useEffect(() => onAuthStateChanged(auth, setUser), [])
  return { user, uid: user?.uid ?? null }
}
