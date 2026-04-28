import { useState, useMemo } from 'react'
import { addDoc, collection, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { Soldier } from '@/types'

interface Props {
  soldiers: Soldier[]
  onClose: () => void
}

export default function InquiryModal({ soldiers, onClose }: Props) {
  const [search, setSearch] = useState('')
  const [showDrop, setShowDrop] = useState(false)
  const [selectedSoldier, setSelectedSoldier] = useState<Soldier | null>(null)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const filtered = useMemo(() =>
    soldiers.filter(s => s.full_name.includes(search)).slice(0, 15),
    [soldiers, search]
  )

  function pick(s: Soldier) {
    setSelectedSoldier(s)
    setSearch(s.full_name)
    setShowDrop(false)
  }

  async function submit() {
    if (!selectedSoldier || !message.trim()) return
    setSending(true)
    await addDoc(collection(db, 'inquiries'), {
      soldier_id: selectedSoldier.id,
      soldier_name: selectedSoldier.full_name,
      message: message.trim(),
      created_at: Timestamp.now(),
      read: false,
    })
    setSending(false)
    setSent(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" dir="rtl">
        {sent ? (
          <div className="text-center py-4">
            <div className="text-4xl mb-3">✅</div>
            <p className="font-semibold text-slate-800 mb-1">הפנייה נשלחה!</p>
            <p className="text-sm text-slate-500 mb-6">האחראי יראה את הפנייה בקרוב.</p>
            <button onClick={onClose} className="bg-navy text-white rounded-xl px-6 py-2 text-sm font-semibold">
              סגור
            </button>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-navy text-lg">פנייה לאחראי שבצ&quot;ק</h2>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
            </div>

            {/* Soldier search */}
            <div className="mb-4 relative">
              <label className="block text-xs font-semibold text-slate-600 mb-1">שם החייל</label>
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setSelectedSoldier(null); setShowDrop(true) }}
                onFocus={() => setShowDrop(true)}
                placeholder="חפש שם..."
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:border-navy"
              />
              {showDrop && filtered.length > 0 && (
                <div className="absolute top-full right-0 left-0 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-44 overflow-y-auto mt-1">
                  {filtered.map(s => (
                    <button key={s.id} onClick={() => pick(s)}
                      className="w-full text-right px-3 py-2 text-sm text-slate-900 hover:bg-slate-50 transition">
                      {s.full_name}
                    </button>
                  ))}
                </div>
              )}
              {showDrop && <div className="fixed inset-0 z-40" onClick={() => setShowDrop(false)} />}
            </div>

            {/* Message */}
            <div className="mb-5">
              <label className="block text-xs font-semibold text-slate-600 mb-1">הערה / פנייה</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="כתוב כאן את הפנייה שלך..."
                rows={4}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:border-navy resize-none"
              />
            </div>

            <button
              onClick={submit}
              disabled={!selectedSoldier || !message.trim() || sending}
              className="w-full bg-navy text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-navy-light transition"
            >
              {sending ? 'שולח...' : 'שלח פנייה'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
