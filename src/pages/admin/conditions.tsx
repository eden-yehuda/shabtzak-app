import { useEffect, useState } from 'react'
import AdminLayout from '@/components/layout/AdminLayout'
import {
  collection, onSnapshot, orderBy, query,
  addDoc, deleteDoc, doc, Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

interface Condition {
  id: string
  text: string
  created_at: Date
}

export default function ConditionsPage() {
  const [conditions, setConditions] = useState<Condition[]>([])
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const q = query(collection(db, 'conditions'), orderBy('created_at', 'desc'))
    return onSnapshot(q, snap => {
      setConditions(snap.docs.map(d => ({
        id: d.id,
        text: d.data().text ?? '',
        created_at: d.data().created_at?.toDate() ?? new Date(),
      })))
    })
  }, [])

  async function add() {
    if (!draft.trim()) return
    setSaving(true)
    await addDoc(collection(db, 'conditions'), {
      text: draft.trim(),
      created_at: Timestamp.now(),
    })
    setDraft('')
    setSaving(false)
  }

  async function remove(id: string) {
    await deleteDoc(doc(db, 'conditions', id))
  }

  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-navy mb-6">התניות</h1>

      {/* Add new */}
      <div className="bg-white rounded-xl p-4 shadow-sm mb-6">
        <label className="block text-sm font-semibold text-slate-700 mb-2">הוסף התניה חדשה</label>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) add() }}
          placeholder="לדוגמה: פלוני לא יכול לשרת עם פלמוני / יש אימון ביום ה׳..."
          rows={3}
          className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:border-navy resize-none mb-3"
        />
        <button
          onClick={add}
          disabled={!draft.trim() || saving}
          className="bg-navy text-white rounded-xl px-5 py-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-navy-light transition"
        >
          {saving ? 'שומר...' : '+ הוסף'}
        </button>
      </div>

      {/* List */}
      {conditions.length === 0 ? (
        <p className="text-slate-400 text-center py-10">אין התניות</p>
      ) : (
        <div className="space-y-2">
          {conditions.map(c => (
            <div key={c.id} className="bg-white rounded-xl px-4 py-3 shadow-sm flex items-start gap-3">
              <p className="flex-1 text-sm text-slate-800 whitespace-pre-wrap">{c.text}</p>
              <button
                onClick={() => remove(c.id)}
                className="text-slate-300 hover:text-red-500 transition text-lg leading-none mt-0.5 flex-shrink-0"
                title="מחק"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  )
}
