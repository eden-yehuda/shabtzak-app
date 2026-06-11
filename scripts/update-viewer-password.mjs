import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, updatePassword } from 'firebase/auth'

const firebaseConfig = {
  apiKey: 'AIzaSyCXK2PAEXmCM0R9-JJA_wMENoh9k3XwnOw',
  authDomain: 'shabtzak-app.firebaseapp.com',
  projectId: 'shabtzak-app',
  storageBucket: 'shabtzak-app.firebasestorage.app',
  messagingSenderId: '207869926707',
  appId: '1:207869926707:web:544e65feac1c4a4a1e7246',
}

const PREFIX = 'shivzuk-'
const OLD_PW = PREFIX + 'עוף'
const NEW_PW = PREFIX + 'נפתלי'

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)

try {
  const cred = await signInWithEmailAndPassword(auth, 'viewer@shivzuk.app', OLD_PW)
  await updatePassword(cred.user, NEW_PW)
  console.log('✅ סיסמת הצופה עודכנה לנפתלי')
} catch (e) {
  console.error('❌', e.code, e.message)
}
process.exit(0)
