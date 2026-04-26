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
export const updateTask = (id: string, data: Partial<Task>) =>
  updateDoc(doc(db, 'tasks', id), data)
export const deleteTask = (id: string) =>
  deleteDoc(doc(db, 'tasks', id))

// --- Assignments ---
export const assignmentsRef = () => collection(db, 'assignments')
export const createAssignment = (task_id: string, soldier_id: string) =>
  addDoc(assignmentsRef(), { task_id, soldier_id })
export const deleteAssignment = (id: string) =>
  deleteDoc(doc(db, 'assignments', id))

// --- Leave Requests ---
export const leaveRequestsRef = () => collection(db, 'leave_requests')
export const createLeaveRequest = (soldier_id: string, date: string) =>
  addDoc(leaveRequestsRef(), {
    soldier_id,
    date,
    status: 'pending',
    created_at: serverTimestamp(),
  })
export const updateLeaveStatus = (
  id: string,
  status: LeaveRequest['status'],
  reviewed_by: string
) => updateDoc(doc(db, 'leave_requests', id), { status, reviewed_by })

// --- Task Types ---
export const taskTypesRef = () => collection(db, 'task_types')
