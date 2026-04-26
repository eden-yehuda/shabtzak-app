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
  { full_name: 'יוסי כהן', team: 'כיתה א', is_active: true },
  { full_name: 'דניאל לוי', team: 'כיתה א', is_active: true },
  { full_name: 'אחמד מנסור', team: 'כיתה ב', is_active: true },
  { full_name: 'משה אברהם', team: 'כיתה ב', is_active: true },
  { full_name: 'רועי דוד', team: 'כיתה א', is_active: true },
  { full_name: 'אלון שפירא', team: 'כיתה ב', is_active: true },
  { full_name: 'ניר בן-דוד', team: 'כיתה א', is_active: true },
  { full_name: 'עומר ישראלי', team: 'כיתה ב', is_active: true },
  { full_name: 'גיא פרץ', team: 'כיתה א', is_active: true },
  { full_name: 'אבי שלום', team: 'כיתה ב', is_active: true },
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
