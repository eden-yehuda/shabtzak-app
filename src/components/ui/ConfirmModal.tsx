interface Props {
  message: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({ message, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
        <p className="text-base text-slate-700 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg border text-slate-600 hover:bg-slate-50">
            ביטול
          </button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-lg bg-navy text-white hover:bg-navy-light">
            אישור
          </button>
        </div>
      </div>
    </div>
  )
}
