// Script: update commanders in Firestore
// Usage: node scripts/update-commanders.mjs

import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw',
  authDomain: 'shabtzak-app.firebaseapp.com',
  projectId: 'shabtzak-app',
  storageBucket: 'shabtzak-app.firebasestorage.app',
  messagingSenderId: '207869926707',
  appId: '1:207869926707:web:544e65feac1c4a4a1e7246',
}

const COMMANDERS = ['אוראל', 'בוצר', 'דביר', 'אופיר', 'ירין', 'יגל', 'עמיחי']

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

const snap = await getDocs(collection(db, 'soldiers'))
let updated = 0, skipped = 0

for (const d of snap.docs) {
  const data = d.data()
  const name = data.full_name ?? ''
  // Match by any word in full_name (handles nicknames that are first or last name)
  const nameParts = name.split(' ')
  const shouldBeCommander = nameParts.some(part => COMMANDERS.includes(part))
  if (shouldBeCommander !== data.is_commander) {
    await updateDoc(doc(db, 'soldiers', d.id), { is_commander: shouldBeCommander })
    console.log(`✓ ${name}: is_commander → ${shouldBeCommander}`)
    updated++
  } else {
    console.log(`- ${name}: כבר נכון (${data.is_commander})`)
    skipped++
  }
}

console.log(`\nסיום: ${updated} עודכנו, ${skipped} ללא שינוי`)
process.exit(0)
