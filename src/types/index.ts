export interface Soldier {
  id: string
  full_name: string
  team: string
  is_active: boolean
  is_commander: boolean
  notes: string
  fixed_home_ranges: Array<{ from: string; to: string }> // YYYY-MM-DD
  // Optional: specific date+hour windows when the soldier IS present (partial week)
  presence_windows?: Array<{ from_date: string; from_hour: number; to_date: string; to_hour: number }>
}

export interface Schedule {
  id: string
  name: string
  start_datetime: Date
  end_datetime: Date
  status: 'draft' | 'published'
  created_by: string
  updated_at?: Date
  day_start_hour?: number
  home_leave_hour?: number  // hour when soldiers swap (depart/return); defaults to day_start_hour
  dismissed_validation_errors?: string[]  // stable keys of errors the user has manually marked as OK
}

export interface TaskType {
  id: string
  name: string
  difficulty: 'hard' | 'easy'
  color: string
  requires_commander: boolean
  soldiers_required: number
  shift_duration_hours: number
  is_emphasized: boolean // true for מטבח/רס"פ/של"ז
}

export interface Task {
  id: string
  schedule_id: string
  task_name: string
  task_type: string
  difficulty: 'hard' | 'easy'
  start_datetime: Date
  end_datetime: Date
  required_people_count: number
  requires_commander: boolean
  notes?: string
  time_display?: string  // optional override for the displayed time label (e.g. "08:00–20:00")
}

export interface Assignment {
  id: string
  task_id: string
  soldier_id: string
  order: number   // 0 = task commander, 1+ = rest in Excel order
  note?: string   // e.g. "עד 10", "מ15"
  alternating_group?: number // soldiers with the same non-null group in a task are shown together with " / "
  is_acting_commander?: boolean // when true → this assignment shows ★ in the task card (per-task commander)
}

export interface LeaveRequest {
  id: string
  soldier_id: string
  date: string // 'YYYY-MM-DD'
  status: 'pending' | 'approved' | 'rejected'
  is_final: boolean
  note?: string
  created_at: Date
  reviewed_by?: string
}

export interface ValidationError {
  type: 'error' | 'warning'
  message: string
  soldier_id?: string
  task_id?: string
}
