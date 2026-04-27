import type { ValidationError } from '@/types'

export default function ValidationPanel({ errors }: { errors: ValidationError[] }) {
  if (errors.length === 0) return (
    <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-green-700 text-sm">
      {'✓ אין שגיאות'}
    </div>
  )

  const errs = errors.filter(e => e.type === 'error')
  const warns = errors.filter(e => e.type === 'warning')

  return (
    <div className="space-y-2">
      {errs.map((e) => (
        <div key={`err-${e.soldier_id ?? ''}-${e.task_id ?? ''}-${e.message}`} className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex gap-2">
          <span>{'🔴'} {e.message}</span>
        </div>
      ))}
      {warns.map((e) => (
        <div key={`warn-${e.soldier_id ?? ''}-${e.task_id ?? ''}-${e.message}`} className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-800 flex gap-2">
          <span>{'🟡'} {e.message}</span>
        </div>
      ))}
    </div>
  )
}
