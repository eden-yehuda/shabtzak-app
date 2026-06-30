import CelebrationShow from '@/components/CelebrationShow'

// Public (team-viewer) celebration page — "חגיגת סוף סבב".
// AuthGate (_app) signs the team in with the shared viewer account, which Firestore
// rules allow to read soldiers/tasks/assignments — so the leaderboard + quiz work here.
export default function CelebrationPage() {
  return <CelebrationShow backHref="/" backLabel="← חזרה לשבצ״ק" />
}
