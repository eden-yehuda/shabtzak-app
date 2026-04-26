interface Props {
  message: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({ message, onConfirm, onCancel }: Props) {
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
      onClick={onCancel}
      aria-modal="true"
      role="dialog"
      aria-describedby="confirm-message"
    >
      <div
        className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full"
        onClick={e => e.stopPropagation()}
      >
        <p id="confirm-message" className="text-base text-slate-700 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg border text-slate-600 hover:bg-slate-50">
            ביטול
          </button>
          <button type="button" onClick={onConfirm} className="px-4 py-2 rounded-lg bg-navy text-white hover:bg-navy-light">
            אישור
          </button>
        </div>
      </div>
    </div>
  )
}
