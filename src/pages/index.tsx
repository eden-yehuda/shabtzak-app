import { useState } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/layout/Layout'
import { useSoldiers } from '@/hooks/useSoldiers'

export default function Home() {
  const soldiers = useSoldiers()
  const [search, setSearch] = useState('')
  const router = useRouter()

  const filtered = soldiers.filter(s =>
    s.full_name.includes(search)
  )

  function selectSoldier(id: string, name: string) {
    localStorage.setItem('soldierId', id)
    localStorage.setItem('soldierName', name)
    router.push('/dashboard')
  }

  return (
    <Layout title="בחר זהות">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-navy mb-2">ברוך הבא</h1>
        <p className="text-slate-500 mb-6">בחר את שמך כדי להיכנס</p>
        <input
          type="text"
          placeholder="חפש שם..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full border border-slate-300 rounded-xl px-4 py-3 mb-4 text-right focus:outline-none focus:ring-2 focus:ring-navy"
        />
        <div className="space-y-2">
          {filtered.map(s => (
            <button
              key={s.id}
              onClick={() => selectSoldier(s.id, s.full_name)}
              className="w-full text-right bg-white border border-slate-200 rounded-xl px-4 py-3 hover:bg-slate-50 hover:border-navy transition font-medium"
            >
              {s.full_name}
              <span className="text-slate-400 text-sm font-normal mr-2">({s.team})</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-slate-400 py-8">לא נמצאו חיילים</p>
          )}
        </div>
      </div>
    </Layout>
  )
}
