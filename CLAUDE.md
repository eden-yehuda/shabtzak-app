# Shabtzak App — הוראות לClaude

## אחרי כל שינוי בקוד

בסיום כל תיקון או שינוי, בצע אוטומטית:

```bash
git add -A
git commit -m "fix: <תיאור קצר של השינוי>"
git checkout main
git merge master --no-edit
git push origin main
git checkout master
```

אל תשאל את המשתמש אם לעשות push — פשוט עשה זאת.

## פרטי פרויקט

- **שם:** שבצ"ק עוף
- **Stack:** Next.js 14, TypeScript, Tailwind CSS, Firebase Firestore
- **כיוון:** RTL, עברית בלבד
- **GitHub:** https://github.com/eden-yehuda/shabtzak-app
- **Netlify:** https://shivzuk.netlify.app — מחובר ל-GitHub ענף **main** (לא master!), מתעדכן אוטומטית בכל push ל-main
