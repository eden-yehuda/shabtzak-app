import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  Timestamp, serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import type { LeaveRequest, Task, Schedule } from '@/types'

// --- Soldiers ---
export const soldiersRef = () => collection(db, 'soldiers')

// --- Schedules ---
export const schedulesRef = () => collection(db, 'schedules')
export const createSchedule = (data: Omit<Schedule, 'id'>) =>
  addDoc(schedulesRef(), {
    ...data,
    start_datetime: Timestamp.fromDate(data.start_datetime),
    end_datetime: Timestamp.fromDate(data.end_datetime),
  })

// --- Tasks ---
export const tasksRef = () => collection(db, 'tasks')
export const createTask = (data: Omit<Task, 'id'>) =>
  addDoc(tasksRef(), {
    ...data,
    start_datetime: Timestamp.fromDate(data.start_datetime),
    end_datetime: Timestamp.fromDate(data.end_datetime),
  })
export const updateTask = (id: string, data: Partial<Task>) => {
  const payload: Record<string, unknown> = { ...data }
  if (data.start_datetime instanceof Date) {
    payload.start_datetime = Timestamp.fromDate(data.start_datetime)
  }
  if (data.end_datetime instanceof Date) {
    payload.end_datetime = Timestamp.fromDate(data.end_datetime)
  }
  return updateDoc(doc(db, 'tasks', id), payload)
}
export const deleteTask = (id: string) =>
  deleteDoc(doc(db, 'tasks', id))

// --- Assignments ---
export const assignmentsRef = () => collection(db, 'assignments')
export const createAssignment = (task_id: string, soldier_id: string, order: number = 1, note?: string) =>
  addDoc(assignmentsRef(), { task_id, soldier_id, order, ...(note ? { note } : {}) })
export const updateAssignment = (id: string, data: Record<string, unknown>) =>
  updateDoc(doc(db, 'assignments', id), data)
export const deleteAssignment = (id: string) =>
  deleteDoc(doc(db, 'assignments', id))

// --- Leave Requests ---
export const leaveRequestsRef = () => collection(db, 'leave_requests')
export const createLeaveRequest = (soldier_id: string, date: string) =>
  addDoc(leaveRequestsRef(), {
    soldier_id,
    date,
    status: 'pending',
    is_final: false,
    created_at: serverTimestamp(),
  })
export const updateLeaveStatus = (
  id: string,
  status: LeaveRequest['status'],
  reviewed_by: string
) => updateDoc(doc(db, 'leave_requests', id), { status, reviewed_by })

// --- Task Types ---
export const taskTypesRef = () => collection(db, 'task_types')

// --- Leave Versions (full-state snapshots of leave_requests) ---
export const leaveVersionsRef = () => collection(db, 'leave_versions')

// --- Published Versions (snapshots of published schedules) ---
export const publishedVersionsRef = () => collection(db, 'published_versions')
export interface PublishedVersionSnapshot {
  schedule_id: string
  schedule_name: string
  schedule_start: Timestamp
  schedule_end: Timestamp
  day_start_hour?: number
  home_leave_hour?: number
  tasks: Array<{
    id: string
    task_type: string
    task_name: string
    start_datetime: Timestamp
    end_datetime: Timestamp
    requires_commander: boolean
    required_people_count: number
    notes?: string
  }>
  assignments: Array<{
    id: string
    task_id: string
    soldier_id: string
    order?: number
    alternating_group?: number
    note?: string
  }>
  published_at: Timestamp
  published_by: string
}
