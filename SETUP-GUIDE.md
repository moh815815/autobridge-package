# دليل تشغيل AutoBridge مع Supabase

## الخطوة 1 — أنشئ مشروع Supabase
1. روح لـ https://supabase.com → New Project
2. اختر اسم + باسورد لقاعدة البيانات + المنطقة (Frankfurt أقرب للمنطقة العربية)
3. انتظر دقيقتين لحد ما المشروع يخلص setup

## الخطوة 2 — شغّل السكيما
1. من Dashboard، روح لـ **SQL Editor** → **New Query**
2. افتح ملف `supabase-setup.sql` وانسخ كل المحتوى
3. الصقه في الـ SQL Editor واضغط **Run**
4. لو ظهر "Success" يعني كل الجداول والـ RLS اتعملوا ✅

## الخطوة 3 — فعّل Email Auth
1. روح لـ **Authentication** → **Providers**
2. تأكد إن **Email** مفعّل (مفعّل بشكل افتراضي)
3. لو عايز تمنع تأكيد الإيميل وقت التجربة: **Authentication** → **Settings** → عطّل "Confirm email"

## الخطوة 4 — هات بياناتك
1. روح لـ **Project Settings** (الترس) → **API**
2. هتلاقي:
   - **Project URL** → مثال: `https://abcdefgh.supabase.co`
   - **anon public key** → مفتاح طويل يبدأ بـ `eyJ...`

## الخطوة 5 — حدّث الكود
افتح `autobridge-supabase.jsx` وغيّر أول سطرين:

```js
const SUPABASE_URL  = "https://abcdefgh.supabase.co";   // URL بتاعك
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIs...";          // anon key بتاعك
```

## الخطوة 6 — أنشئ شركة وربطها بحسابك (مرة واحدة فقط)
بعد ما تعمل أول حساب من صفحة التسجيل، روح لـ **Table Editor** → **companies** واعمل صف جديد:
- `name`: اسم شركتك
- `plan`: starter

بعدين روح لـ **profiles** ولاقي صفك (بالإيميل بتاعك) وحدّث `company_id` بالـ id بتاع الشركة اللي عملتها.

> 💡 لاحقاً ممكن نضيف صفحة "أنشئ شركة" تعمل ده تلقائي عند أول تسجيل.

## الخطوة 7 — أضف أول تدفق وخطواته
من **Table Editor** → **flows** → Insert row:
- `title`: "متجر إلكتروني"
- `icon`: 🛒
- `color`: #0ea5e9
- `company_id`: نفس الشركة بتاعتك
- `status`: active

بعدين في **flow_steps** أضف الخطوات (لكل خطوة صف):
- `flow_id`: id التدفق اللي عملته
- `step_order`: 1, 2, 3...
- `name`: "جلب الطلب"
- `url`: `https://jsonplaceholder.typicode.com` (API تجريبي مجاني للاختبار)
- `method`: GET
- `path`: `/posts/1`
- `auth_type`: None

## الخطوة 8 — جرّب
1. افتح المشروع في Claude/أداتك المعتادة لعرض الـ React artifact
2. سجّل دخول بالحساب اللي عملته
3. روح لـ "التدفقات" → اختر التدفق → اضغط "تشغيل"
4. لو الخطوة بترسل لـ `jsonplaceholder.typicode.com` هتشوف استجابة حقيقية 200 OK في اللوج!

---

## ⚠️ ملاحظات أمان مهمة قبل الإنتاج الحقيقي

1. **لا تخزن API keys حساسة كـ plain text** في `flow_steps.auth_value` — استخدم [Supabase Vault](https://supabase.com/docs/guides/database/vault) للتشفير
2. **فعّل Row Level Security بعناية** — السكيما المرفقة فيها RLS أساسي، لكن لازم تتأكد إن كل company منعزلة فعلاً
3. **استخدم Edge Functions بدل تنفيذ من المتصفح** — تنفيذ الـ API calls من جهة العميل (كما في الكود الحالي) يكشف الـ headers والـ tokens في Network tab؛ في نسخة production الأفضل تنقل `executeStep` لـ Supabase Edge Function
4. **فعّل rate limiting** على الـ Edge Functions لمنع abuse
5. **استخدم Service Role Key فقط على السيرفر** — أبداً مش في كود الـ frontend

---

## إضافات مستقبلية ممكنة
- [ ] صفحة "أنشئ شركة" تلقائية عند أول تسجيل
- [ ] Edge Function لتنفيذ الخطوات بأمان (يخفي الـ secrets عن المتصفح)
- [ ] Realtime subscriptions بدل polling للإشعارات
- [ ] Webhook receiver (Edge Function) يستقبل من أنظمة خارجية فعلاً
- [ ] Cron جدولة عبر `pg_cron` لتشغيل التدفقات تلقائياً
