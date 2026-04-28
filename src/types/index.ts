export interface Soldier {
  id: string
  full_name: string
  team: string
  is_active: boolean
  is_commander: boolean
  notes: string
  fixed_home_ranges: Array<{ from: string; to: string }> // YYYY-MM-DD
}

export interface Schedule {
  id: string
  name: string
  start_datetime: Date
  end_datetime: Date
  status: 'draft' | 'published'
  created_by: string
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
}

export interface Assignment {
  id: string
  task_id: string
  soldier_id: string
  order: number   // 0 = task commander, 1+ = rest in Excel order
}

export interface LeaveRequest {
  id: string
  soldier_id: string
  date: string // 'YYYY-MM-DD'
  status: 'pending' | 'approved' | 'rejected'
  is_final: boolean
  created_at: Date
  reviewed_by?: string
}

export interface ValidationError {
  type: 'error' | 'warning'
  message: string
  soldier_id?: string
  task_id?: string
}
