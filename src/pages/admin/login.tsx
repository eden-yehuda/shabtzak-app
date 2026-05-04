import { useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { useRouter } from 'next/router'
import { auth } from '@/lib/firebase'

// Visible demo credentials so anyone can log in and explore the admin interface.
// (A matching Firebase user must exist for these to work.)
const DEMO_EMAIL = 'demo@shivzuk.app'
const DEMO_PASSWORD = 'demo1234'

export default function AdminLogin() {
  const router = useRouter()
  const [email, setEmail] = useState(DEMO_EMAIL)
  const [password, setPassword] = useState(DEMO_PASSWORD)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await signInWithEmailAndPassword(auth, email, password)
      router.push('/admin/dashboard')
    } catch {
      setError('שם משתמש או סיסמה שגויים')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center px-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-navy mb-2 text-center">כניסת מנהל</h1>
        <p className="text-xs text-center text-slate-500 mb-5">
          🎬 פרטי דמו גלויים — פשוט לחץ &quot;כניסה&quot; כדי להציץ
        </p>
        <form onSubmit={login} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1 font-semibold">אימייל</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-navy bg-amber-50"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1 font-semibold">סיסמה</label>
            <input
              type="text"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-navy bg-amber-50 font-mono"
              required
            />
          </div>
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-navy text-white rounded-xl py-3 font-semibold disabled:opacity-50"
          >
            {loading ? 'נכנס...' : 'כניסה'}
          </button>
        </form>
        <p className="text-xs text-center text-slate-400 mt-4">
          לתצוגה אנונימית של ממשק לוחמים: <a href="/demo" className="text-navy hover:underline font-semibold">/demo</a>
        </p>
      </div>
    </div>
  )
}
