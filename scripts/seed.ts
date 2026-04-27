// Run with: npx ts-node --project tsconfig.json scripts/seed.ts
import { initializeApp } from 'firebase/app'
import { getFirestore, collection, addDoc } from 'firebase/firestore'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
})
const db = getFirestore(app)

const soldiers = [
  { full_name: 'אדיר סולמי', team: '', is_active: true },
  { full_name: 'אוראל אפנזר', team: '', is_active: true },
  { full_name: 'אופיר אלטמן', team: '', is_active: true },
  { full_name: 'אחיה בכרך', team: '', is_active: true },
  { full_name: 'אילון אומן', team: '', is_active: true },
  { full_name: 'אמיתי ברמה', team: '', is_active: true },
  { full_name: 'אנדריי טיאן', team: '', is_active: true },
  { full_name: 'דביר משה', team: '', is_active: true },
  { full_name: 'זיו צארום', team: '', is_active: true },
  { full_name: 'חגי פייגנבום', team: '', is_active: true },
  { full_name: 'טל סימקו', team: '', is_active: true },
  { full_name: 'ינון אוחיון', team: '', is_active: true },
  { full_name: 'יגל משה', team: '', is_active: true },
  { full_name: 'יהונתן בוצר', team: '', is_active: true },
  { full_name: 'יואב חדד', team: '', is_active: true },
  { full_name: 'יעקב אלישביץ', team: '', is_active: true },
  { full_name: 'ירין צור', team: '', is_active: true },
  { full_name: 'לאון', team: '', is_active: true },
  { full_name: 'מאור כליפה', team: '', is_active: true },
  { full_name: 'מאור לוי', team: '', is_active: true },
  { full_name: 'מאור צדיק', team: '', is_active: true },
  { full_name: 'מיתר לזימי', team: '', is_active: true },
  { full_name: 'נתן לדקוב', team: '', is_active: true },
  { full_name: 'נתניאל לישה', team: '', is_active: true },
  { full_name: 'סתיו אוראל', team: '', is_active: true },
  { full_name: 'עדן יהודה', team: '', is_active: true },
  { full_name: 'עידן אלמו', team: '', is_active: true },
  { full_name: 'עמיחי עוזיאל', team: '', is_active: true },
  { full_name: 'רמבו', team: '', is_active: true },
  { full_name: 'רפאל אלקיים', team: '', is_active: true },
  { full_name: 'שי גנאשווילי', team: '', is_active: true },
]

const taskTypes = [
  { name: 'שמירת ש.ג', difficulty: 'hard', color: '#3b82f6' },
  { name: 'פטרול', difficulty: 'hard', color: '#f59e0b' },
  { name: 'מטבח', difficulty: 'easy', color: '#8b5cf6' },
  { name: 'לוגיסטיקה', difficulty: 'easy', color: '#22c55e' },
  { name: 'ניקיון', difficulty: 'easy', color: '#06b6d4' },
]

async function seed() {
  for (const s of soldiers) await addDoc(collection(db, 'soldiers'), s)
  for (const t of taskTypes) await addDoc(collection(db, 'task_types'), t)
  console.log('Seeded successfully')
  process.exit(0)
}
seed()
