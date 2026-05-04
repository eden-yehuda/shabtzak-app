import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { useUnreadInquiriesCount } from '@/hooks/useUnreadInquiries'

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const unreadInquiries = useUnreadInquiriesCount()

  useEffect(() => {
    return onAuthStateChanged(auth, user => {
      if (!user) router.replace('/admin/login')
      else setChecking(false)
    })
  }, [router])

  // "עוד" dropdown state
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (moreOpen && moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [moreOpen])

  if (checking) return null

  return (
    <div className="min-h-screen bg-slate-100 font-sans" dir="rtl">
      <header className="bg-navy text-white px-4 py-3 flex gap-4 items-center shadow flex-wrap">
        <Link href="/" className="font-bold text-lg hover:opacity-80 transition">{'מנהל שבצ"ק'}</Link>
        <nav className="flex gap-3 text-sm flex-wrap items-center">
          <Link href="/" className="hover:underline opacity-70">🏠 ממשק לוחמים</Link>
          {/* Mobile-only: quick access to full schedule view */}
          <Link href="/admin/view" className="md:hidden hover:underline bg-white/15 hover:bg-white/25 rounded px-2 py-0.5 transition">
            👁 שבצ"ק מלא
          </Link>
          <Link href="/admin/dashboard" className="hover:underline">דשבורד</Link>
          <Link href="/admin/soldiers" className="hover:underline">כוח אדם</Link>
          <Link href="/admin/leave" className="hover:underline">יציאות</Link>

          {/* "עוד" dropdown — collapses less-frequent items */}
          <div className="relative" ref={moreRef}>
            <button onClick={() => setMoreOpen(o => !o)}
              className="hover:underline flex items-center gap-1">
              עוד {moreOpen ? '▴' : '▾'}
              {unreadInquiries > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {unreadInquiries}
                </span>
              )}
            </button>
            {moreOpen && (
              <div className="absolute top-full right-0 mt-1 bg-white text-slate-800 rounded-lg shadow-xl border border-slate-200 z-50 min-w-[180px] py-1">
                <Link href="/admin/schedule/new" onClick={() => setMoreOpen(false)}
                  className="block px-4 py-2 text-sm hover:bg-slate-50">
                  {'שבצ"ק חדש'}
                </Link>
                <Link href="/admin/justice" onClick={() => setMoreOpen(false)}
                  className="block px-4 py-2 text-sm hover:bg-slate-50">
                  טבלת צדק
                </Link>
                <Link href="/admin/inquiries" onClick={() => setMoreOpen(false)}
                  className="flex items-center justify-between px-4 py-2 text-sm hover:bg-slate-50">
                  <span>פניות</span>
                  {unreadInquiries > 0 && (
                    <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                      {unreadInquiries} חדשות
                    </span>
                  )}
                </Link>
                <Link href="/admin/conditions" onClick={() => setMoreOpen(false)}
                  className="block px-4 py-2 text-sm hover:bg-slate-50">
                  התניות
                </Link>
              </div>
            )}
          </div>
        </nav>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
