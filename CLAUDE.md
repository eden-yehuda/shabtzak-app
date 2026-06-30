# Shabtzak App — הוראות לClaude

## Workflow חדש: staging → prod

מעכשיו **כל שינוי הולך קודם ל-staging**. רק לאחר אישור המשתמש מקדמים ל-prod.

### לאחר כל שינוי בקוד — staging only

בסיום כל תיקון או שינוי, בצע אוטומטית:

```bash
git add -A
git commit -m "fix: <תיאור קצר של השינוי>"
git checkout staging
git merge master --no-edit
git push origin staging
git checkout master
git push origin master
```

הפרסום ל-staging מתעדכן אוטומטית. **אל תיגע בענף `main`** עד שהמשתמש מאשר את ה-staging.

### קידום ל-prod (רק אחרי אישור מפורש מהמשתמש)

כשהמשתמש כותב משהו כמו "תקדם לפרוד", "אשר", "תפרסם", "go live":

```bash
git checkout main
git merge staging --no-edit
git push origin main
git checkout master
```

לפני קידום, ודא שהמשתמש אישר במפורש את ה-staging.

## פרטי פרויקט

- **שם:** שבצ"ק עוף
- **Stack:** Next.js 14, TypeScript, Tailwind CSS, Firebase Firestore
- **כיוון:** RTL, עברית בלבד
- **GitHub:** https://github.com/eden-yehuda/shabtzak-app

### סביבות Netlify

| סביבה   | ענף       | URL                                          |
|---------|-----------|----------------------------------------------|
| Prod    | `main`    | https://shavzak1.netlify.app                 |
| Staging | `staging` | https://staging--shivzuk.netlify.app *(נדרש להפעיל branch deploys בנטליפיי)* |

### דמו לציבור

- `/demo` — תצוגת לוחמים אנונימית (שמות = "מפקד 1", "לוחם 1", ...)
- `/admin/login` — שדות אימייל/סיסמה מוצגים גלויים: `demo@shivzuk.app` / `demo1234` (יש ליצור משתמש Firebase תואם)
