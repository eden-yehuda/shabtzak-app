import { initializeApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth'

const firebaseConfig = {
  apiKey: 'AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw',
  authDomain: 'shabtzak-app.firebaseapp.com',
  projectId: 'shabtzak-app',
  storageBucket: 'shabtzak-app.firebasestorage.app',
  messagingSenderId: '207869926707',
  appId: '1:207869926707:web:544e65feac1c4a4a1e7246',
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)

// User types 'עוף' (3 chars); Firebase requires >=6, so we prepend a fixed public prefix.
// Must stay in sync with VIEWER_PW_PREFIX in src/components/AuthGate.tsx.
const VIEWER_PW = 'shivzuk-' + 'עוף'

try {
  const cred = await createUserWithEmailAndPassword(auth, 'viewer@shivzuk.app', VIEWER_PW)
  console.log('✅ משתמש צופה נוצר:', cred.user.uid)
} catch (e) {
  if (e.code === 'auth/email-already-in-use') {
    console.log('ℹ️ משתמש הצופה כבר קיים — אם הסיסמה שונה מ-"עוף", מחק אותו ב-Firebase Console והרץ שוב.')
  } else {
    console.error('❌ שגיאה:', e.code, e.message)
  }
}
process.exit(0)
