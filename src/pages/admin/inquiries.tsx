import { useEffect, useState } from 'react'
import AdminLayout from '@/components/layout/AdminLayout'
import { collection, onSnapshot, orderBy, query, updateDoc, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Timestamp } from 'firebase/firestore'

interface Inquiry {
  id: string
  soldier_name: string
  message: string
  created_at: Date
  read: boolean
}

export default function InquiriesPage() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([])

  useEffect(() => {
    const q = query(collection(db, 'inquiries'), orderBy('created_at', 'desc'))
    return onSnapshot(q, snap => {
      setInquiries(snap.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          soldier_name: data.soldier_name ?? '',
          message: data.message ?? '',
          created_at: data.created_at instanceof Timestamp ? data.created_at.toDate() : new Date(),
          read: data.read ?? false,
        }
      }))
    })
  }, [])

  async function markRead(id: string) {
    await updateDoc(doc(db, 'inquiries', id), { read: true })
  }

  const unread = inquiries.filter(i => !i.read).length

  function formatTime(d: Date) {
    return d.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <AdminLayout>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-navy">פניות</h1>
        {unread > 0 && (
          <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{unread} חדשות</span>
        )}
      </div>

      {inquiries.length === 0 ? (
        <p className="text-slate-400 text-center py-12">אין פניות</p>
      ) : (
        <div className="space-y-3">
          {inquiries.map(inq => (
            <div
              key={inq.id}
              className={`bg-white rounded-xl p-4 shadow-sm border-r-4 transition ${
                inq.read ? 'border-slate-200' : 'border-navy'
              }`}
            >
              <div className="flex justify-between items-start mb-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800">{inq.soldier_name}</span>
                  {!inq.read && (
                    <span className="bg-navy text-white text-xs px-2 py-0.5 rounded-full">חדשה</span>
                  )}
                </div>
                <span className="text-xs text-slate-400">{formatTime(inq.created_at)}</span>
              </div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{inq.message}</p>
              {!inq.read && (
                <button
                  onClick={() => markRead(inq.id)}
                  className="mt-2 text-xs text-slate-400 hover:text-slate-600 underline transition"
                >
                  סמן כנקרא
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  )
}
