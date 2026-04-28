import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import type { ReactNode } from 'react'
import Link from 'next/link'

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, user => {
      if (!user) router.replace('/admin/login')
      else setChecking(false)
    })
  }, [router])

  if (checking) return null

  return (
    <div className="min-h-screen bg-slate-100 font-sans" dir="rtl">
      <header className="bg-navy text-white px-4 py-3 flex gap-6 items-center shadow">
        <span className="font-bold text-lg">{'מנהל שבצ"ק'}</span>
        <nav className="flex gap-4 text-sm">
          <Link href="/admin/dashboard" className="hover:underline">דשבורד</Link>
          <Link href="/admin/soldiers" className="hover:underline">כוח אדם</Link>
          <Link href="/admin/schedule/new" className="hover:underline">{'שבצ"ק חדש'}</Link>
          <Link href="/admin/leave" className="hover:underline">יציאות</Link>
          <Link href="/admin/justice" className="hover:underline">טבלת צדק</Link>
          <Link href="/admin/inquiries" className="hover:underline">פניות</Link>
          <Link href="/admin/conditions" className="hover:underline">התניות</Link>
        </nav>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
