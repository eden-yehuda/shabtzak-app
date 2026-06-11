import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { onAuthStateChanged, signInWithEmailAndPassword, type User } from 'firebase/auth'
import { auth } from '@/lib/firebase'

const VIEWER_EMAIL = 'viewer@shivzuk.app'
// User types the short password (e.g. 'עוף'); Firebase requires >=6 chars, so we prepend
// a fixed public prefix. The prefix is not secret — security rests on the typed password.
// Must stay in sync with scripts/create-viewer-user.mjs.
const VIEWER_PW_PREFIX = 'shivzuk-'

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(true)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => onAuthStateChanged(auth, u => { setUser(u); setChecking(false) }), [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await signInWithEmailAndPassword(auth, VIEWER_EMAIL, VIEWER_PW_PREFIX + password.trim())
    } catch {
      setError('סיסמה שגויה')
      setLoading(false)
    }
  }

  // The admin section manages its own auth (login page + AdminLayout) — don't gate it.
  if (router.pathname.startsWith('/admin')) return <>{children}</>

  if (checking) return <div className="min-h-screen bg-navy" />

  if (user) return <>{children}</>

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center px-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold text-navy mb-1">שבצ&quot;ק עוף</h1>
        <p className="text-sm text-slate-500 mb-6">הזן סיסמה כדי להיכנס</p>
        <form onSubmit={submit} className="space-y-4">
          <input
            type="password"
            placeholder="סיסמה"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoFocus
            className="w-full border border-slate-300 rounded-xl px-4 py-3 text-center focus:outline-none focus:ring-2 focus:ring-navy"
            required
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-navy text-white rounded-xl py-3 font-semibold disabled:opacity-50"
          >
            {loading ? 'נכנס...' : 'כניסה'}
          </button>
        </form>
      </div>
    </div>
  )
}
