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

try {
  const cred = await createUserWithEmailAndPassword(auth, 'demo@shivzuk.app', 'demo1234')
  console.log('✅ משתמש דמו נוצר:', cred.user.uid)
} catch (e) {
  if (e.code === 'auth/email-already-in-use') {
    console.log('ℹ️ משתמש דמו כבר קיים — אולי הסיסמה שגויה?')
    console.log('   כנס ל-Firebase Console > Authentication ומחק את המשתמש, ואז הרץ שוב.')
  } else {
    console.error('❌ שגיאה:', e.code, e.message)
  }
}
process.exit(0)
