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
      <header className="bg-navy text-white px-4 py-3 flex gap-4 items-center shadow flex-wrap">
        <Link href="/" className="font-bold text-lg hover:opacity-80 transition">{'מנהל שבצ"ק'}</Link>
        <nav className="flex gap-3 text-sm flex-wrap">
          <Link href="/" className="hover:underline opacity-70">🏠 ממשק לוחמים</Link>
          {/* Mobile-only: quick access to full schedule view */}
          <Link href="/admin/view" className="md:hidden hover:underline bg-white/15 hover:bg-white/25 rounded px-2 py-0.5 transition">
            👁 שבצ"ק מלא
          </Link>
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
