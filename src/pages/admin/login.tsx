import { useState } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { useRouter } from 'next/router'
import { auth } from '@/lib/firebase'

export default function AdminLogin() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
        <h1 className="text-2xl font-bold text-navy mb-6 text-center">כניסת מנהל</h1>
        <form onSubmit={login} className="space-y-4">
          <input
            type="email"
            placeholder="אימייל"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-navy"
            required
          />
          <input
            type="password"
            placeholder="סיסמה"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-navy"
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
