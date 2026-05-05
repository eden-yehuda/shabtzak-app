import { useEffect, useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { useRouter } from 'next/router'
import { auth } from '@/lib/firebase'

// Demo credentials are pre-filled ONLY on demo hosts (staging or any host containing "demo").
// On production (shivzuk.netlify.app) the form is empty.
const DEMO_EMAIL = 'demo@shivzuk.app'
const DEMO_PASSWORD = 'demo1234'

function isDemoHost(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname.toLowerCase()
  return h.includes('staging') || h.includes('demo') || h === 'localhost'
}

export default function AdminLogin() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [demoMode, setDemoMode] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Pre-fill demo credentials only on demo/staging hosts (after mount, to avoid SSR mismatch)
  useEffect(() => {
    if (isDemoHost()) {
      setDemoMode(true)
      setEmail(DEMO_EMAIL)
      setPassword(DEMO_PASSWORD)
    }
  }, [])

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
        <h1 className="text-2xl font-bold text-navy mb-6 text-center">כניסת מנהל</h1>
        {demoMode && (
          <p className="text-xs text-center text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
            🎬 סביבת דמו — פרטים גלויים, פשוט לחץ &quot;כניסה&quot;
          </p>
        )}
        <form onSubmit={login} className="space-y-4">
          <input
            type="email"
            placeholder="אימייל"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className={`w-full border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-navy ${demoMode ? 'border-amber-300 bg-amber-50' : 'border-slate-300'}`}
            required
          />
          <input
            type="password"
            placeholder="סיסמה"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className={`w-full border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-navy ${demoMode ? 'border-amber-300 bg-amber-50' : 'border-slate-300'}`}
            required
          />
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
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
