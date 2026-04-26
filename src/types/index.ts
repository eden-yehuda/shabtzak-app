export interface Soldier {
  id: string
  full_name: string
  team: string
  is_active: boolean
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
  notes?: string
}

export interface Assignment {
  id: string
  task_id: string
  soldier_id: string
}

export interface LeaveRequest {
  id: string
  soldier_id: string
  date: string          // 'YYYY-MM-DD'
  status: 'pending' | 'approved' | 'rejected'
  created_at: Date
  reviewed_by?: string
}

export interface ValidationError {
  type: 'error' | 'warning'
  message: string
  soldier_id?: string
  task_id?: string
}
