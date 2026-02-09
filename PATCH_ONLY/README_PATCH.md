V12.6 – תיקונים גלריות/בלוקים

מה זה מתקן
- דף הבית מציג רק בלוקים מהטבלה `blocks`.
- בדף הבית מוצגים רק בלוקים מסוג `gallery_1/2/3` (ולא `gallery`/`gallery_admin`).
- `/api/admin/galleries` – תיקון הרשאות + סינון לפי event_id.
- `fetchSettings` / `fetchBlocks` – סינון לפי event_id.

חובה לבצע SQL פעם אחת
Supabase → SQL Editor → הרץ את הקובץ:
sql/01_blocks_add_event_id.sql
