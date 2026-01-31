# Active Bar — Event Gift Site (V1)

ZIP זה כולל פרויקט Next.js 14 (App Router) + Supabase + Google Drive Sync + Cron.

## מה כלול
- עמוד ראשי `/` עם מצבי זמן (לפני/במהלך/אחרי) + בלוקים לפי DB (הסתרה/הצגה).
- `/blessings` ברכות + העלאת תמונה/וידאו (כקישור) + ריאקציות 👍😍🔥🙏 (toggle).
- `/gallery` העלאת תמונות + Grid (מוכן למובייל).
- `/gift` דף תשלום (Bit/PayBox) + תמונה עגולה (קוטר נשלט).
- `/admin` דף ניהול בסיסי: Settings, Blocks (כולל auto-hide ל־Gift), Moderation (אישור/מחיקה), Ads.
- API:
  - `POST /api/upload` (multipart)
  - `POST /api/posts` (ברכה/גלריה)
  - `POST /api/reactions/toggle`
  - Cron: `GET /api/cron/drive-sync`, `GET /api/cron/archive-and-delete`
******
## התקנה מקומית
```bash
npm install
cp .env.example .env.local
npm run dev
```

## Supabase — DB + Storage
1. צור Project חדש ב‑Supabase.
2. ב־SQL Editor הרץ את המיגרציה:
   - `supabase/migrations/0001_init.sql`
3. ב־Storage:
   - צור Bucket בשם `uploads` והגדר אותו כ‑Public.

## Admin Users (username+password)
הטבלה `admin_users` ממפה `username -> email`.
הסיסמה עצמה מנוהלת ב‑Supabase Auth.

### יצירת משתמש Admin
1. ב‑Supabase -> Authentication -> Users -> Add user
   - Email: לדוגמה `activebararchive@gmail.com`
   - Password: מה שתבחר
2. הוסף רשומה ב‑`admin_users` (Table editor) עם:
   - username: למשל `admin`
   - email: אותו אימייל
   - role: `master` או `client`

### שחזור סיסמה
ב־`/admin` אפשר ללחוץ "שכחתי סיסמה" אחרי שמקלידים username.
הלינק חוזר ל־`/admin/reset` (נכלל בפרויקט).

## משתני סביבה (.env.local)
חובה:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EVENT_SLUG` (למשל `ido`)

Google Drive Sync (Service Account):
- `GDRIVE_SERVICE_ACCOUNT_JSON` (כל ה‑JSON בשורה אחת)
- `GDRIVE_ROOT_FOLDER_ID` (תיקייה משותפת לשירות)

Cron:
- `CRON_SECRET` (מומלץ) — אם אתה מריץ את הקרון ידנית / מחוץ ל־Vercel.

## Vercel Cron
ב־`vercel.json` יש Cron בסיסי.
ב־Vercel Cron מתקבל header `x-vercel-cron: 1` ולכן אין צורך ב־secret.
אם אתה רוצה אבטחה קשיחה יותר (מומלץ לפרודקשן) — הפעל Cron דרך Vercel Dashboard עם URL שכולל `?secret=...` והגדר `CRON_SECRET`.

## Gift auto-hide
בלוק Gift (`type='gift'`) כולל config:
```json
{"auto_hide_after_hours": 24}
```
Cron יכבה אותו אחרי X שעות מתחילת האירוע (ואז הוא נעלם מהדף הראשי בלי "חור").

---

אם תרצה, ב‑V1 הבא אנחנו מחזקים:
- Lightbox מלא בגלריה
- ספירת ריאקציות בזמן אמת
- ניהול עיצוב כפתורים/צבעים ברמת UI מלאה (כפי באפיון) עם editor נוח יותר
\n\n## V12 Notes\n- OG meta tags are enforced via src/app/head.tsx and use /api/og/image?default=1 (absolute).\n- Added public/og-default.png fallback.\n- Added RPC migration post_id_from_prefix(p_prefix text). Run it once in Supabase.
