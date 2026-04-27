import type { Task, Assignment, Soldier } from '@/types'

export async function exportToPDF(scheduleName: string): Promise<void> {
  const html2pdf = (await import('html2pdf.js')).default
  const element = document.getElementById('schedule-print-area')
  if (!element) return
  await html2pdf().set({
    margin: 10,
    filename: `שבצק-${scheduleName}.pdf`,
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { orientation: 'landscape' },
  }).from(element).save()
}

export function exportToExcel(
  tasks: Task[],
  assignments: Assignment[],
  soldiers: Soldier[],
  scheduleName: string
): void {
  import('xlsx').then(XLSX => {
    const rows = assignments.map(a => {
      const task = tasks.find(t => t.id === a.task_id)
      const soldier = soldiers.find(s => s.id === a.soldier_id)
      return {
        'חייל': soldier?.full_name ?? '',
        'צוות': soldier?.team ?? '',
        'משימה': task?.task_name ?? '',
        'סוג': task?.task_type ?? '',
        'קושי': task?.difficulty === 'hard' ? 'קשה' : 'קל',
        'התחלה': task?.start_datetime?.toLocaleString('he-IL') ?? '',
        'סיום': task?.end_datetime?.toLocaleString('he-IL') ?? '',
      }
    })

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'שבצק')
    XLSX.writeFile(wb, `שבצק-${scheduleName}.xlsx`)
  }).catch(err => console.error('Excel export failed', err))
}
