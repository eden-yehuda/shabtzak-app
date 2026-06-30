import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import CelebrationShow from '@/components/CelebrationShow'

// Admin route — gated by admin auth, then renders the shared celebration experience.
export default function AdminLeaderboardPage() {
  const router = useRouter()
  const [authed, setAuthed] = useState(false)
  useEffect(() => onAuthStateChanged(auth, u => { if (!u) router.replace('/admin/login'); else setAuthed(true) }), [router])
  if (!authed) return null
  return <CelebrationShow backHref="/admin/justice" backLabel="← חזרה לטבלת הצדק" />
}
