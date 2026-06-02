# 📘 راهنمای قدم به قدم اتصال API باشگاه مشتریان اسمارت به Cake Shop

## فهرست
1. [معماری کلی](#1-معماری-کلی)
2. [پیش‌نیازها](#2-پیشنیازها)
3. [قدم اول: آماده‌سازی سرور](#3-قدم-اول-آمادهسازی-سرور)
4. [قدم دوم: اضافه کردن ویجت به index.html](#4-قدم-دوم-اضافه-کردن-ویجت)
5. [قدم سوم: اتصال به فرم ثبت سفارش](#5-قدم-سوم-اتصال-به-فرم-ثبت-سفارش)
6. [تست و دیباگ](#6-تست-و-دیباگ)
7. [نکات امنیتی](#7-نکات-امنیتی)

---

## 1. معماری کلی

```
┌─────────────────────────────────────────────────────────┐
│                    مشتری (مرورگر)                        │
│  ┌─────────┐   ┌──────────────┐   ┌─────────────────┐  │
│  │ فرم     │──→│ ویجت باشگاه │──→│ ثبت سفارش نهایی │  │
│  │ سفارش   │   │ مشتریان     │   │                 │  │
│  └─────────┘   └──────┬───────┘   └────────┬────────┘  │
└───────────────────────┼────────────────────┼────────────┘
                        │ fetch              │ fetch
                        ▼                    ▼
┌─────────────────────────────────────────────────────────┐
│              server-proxy.js (Node.js)                   │
│  /api/club/inquiry     →  استعلام اعتبار                 │
│  /api/club/use-credit  →  استفاده از اعتبار              │
│  /api/club/undo-credit →  بازگشت اعتبار                 │
│  Token مدیریت خودکار   →  امنیت بالا                     │
└───────────────────────┼──────────────────────────────────┘
                        │ HTTPS
                        ▼
┌─────────────────────────────────────────────────────────┐
│            سرور اسمارت (app.smartx.ir)                   │
│  /ClubPosClient/GetCustomerInquiry                       │
│  /ClubPosClient/UsedCredit                               │
│  /ClubPosClient/UndoUsedCredit                           │
│  /ClubPosClient/GetCustomerActiveCredit                  │
└─────────────────────────────────────────────────────────┘
```

**چرا پراکسی سرور لازمه؟**
- توکن API فقط توی سرور ذخیره میشه (امن‌تره)
- از CORS جلوگیری میشه
- مدیریت خودکار توکن و ریفرش

---

## 2. پیش‌نیازها

- ✅ نام کاربری و رمز عبور API اسمارت
- ✅ کد قفل شعبه (BranchCloudConsumerId) — از اسمارت بگیر
- ✅ Node.js نصب شده روی سرور
- ✅ دسترسی HTTPS به سرور

---

## 3. قدم اول: آماده‌سازی سرور

### 3.1 نصب پکیج‌ها
```bash
cd cake-shop
npm init -y
npm install express cors node-fetch
```

### 3.2 کپی `server-proxy.js`
فایل `server-proxy.js` رو کپی کن توی پوشه `cake-shop/` و تنظیمات رو عوض کن:

```javascript
const CONFIG = {
  CLUB_BASE_URL: 'https://app.smartx.ir/api/v1',
  SYNC_BASE_URL: 'https://sepidz.smartx.ir/api/v1',
  USERNAME: 'نام_کاربری_خودت',       // ← عوض کن
  PASSWORD: 'رمز_عبور_خودت',        // ← عوض کن  
  BRANCH_CLOUD_CONSUMER_ID: 12345,  // ← کد قفل شعبه
  PORT: 5000,
};
```

### 3.3 اجرای سرور
```bash
node server-proxy.js
```

---

## 4. قدم دوم: اضافه کردن ویجت

### 4.1 باز کن `index.html`
محتوای فایل `club-widget-snippet.html` رو کپی کن.

### 4.2 جایگذاری
توی `index.html` بعد از فیلد شماره موبایل و **قبل از** دکمه "ثبت سفارش"، کد HTML ویجت رو بذار:

```html
<!-- فیلد شماره موبایل (موجود) -->
<input id="phone" type="tel" ... />

<!-- ═══ ویجت باشگاه مشتریان ═══ -->
<!-- 👇 اینجا کد club-widget-snippet.html رو بذار 👇 -->
<div class="club-section" id="clubSection">
  ...
</div>

<!-- دکمه ثبت سفارش (موجود) -->
<button id="submitBtn">🎂 ثبت سفارش</button>
```

---

## 5. قدم سوم: اتصال به فرم ثبت سفارش

توی `index.html`، جایی که سفارش ثبت میشه (event listener فرم)، **قبل از** ارسال به API، تخفیف باشگاه رو اعمال کن:

```javascript
// توی event listener فرم:
document.getElementById('orderForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  
  // ... ولیدیشن‌های موجود ...
  
  const payload = {
    name: document.getElementById('fname').value.trim(),
    phone,
    flavor,
    // ... بقیه فیلدها ...
  };
  
  try {
    // 1️⃣ ثبت سفارش
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    
    if (res.ok && json.success) {
      
      // 2️⃣ اگه تخفیف باشگاه فعاله، اعمالش کن
      if (clubState.creditUsed) {
        const factorId = json.factorId || Date.now(); // شماره فاکتور
        const clubResult = await applyClubCredit(factorId);
        
        if (clubResult) {
          console.log('✅ تخفیف باشگاه اعمال شد:', clubResult);
          // usedCreditRequestId رو ذخیره کن!
        }
      }
      
      // 3️⃣ نمایش پیام موفقیت
      document.getElementById('successWrap').classList.add('show');
    }
  } catch (err) {
    showErr('خطا در ثبت سفارش');
  }
});
```

### 5.1 آپدیت قیمت با تخفیف باشگاه

تابع `updatePriceWithClub` رو عوض کن تا قیمت نمایشی آپدیت بشه:

```javascript
function updatePriceWithClub(discountRials) {
  if (typeof lastPrice === 'undefined') return;
  
  const priceCard = document.getElementById('priceCard');
  if (!priceCard) return;
  
  const finalPrice = Math.max(0, lastPrice - discountRials);
  const toman = Math.round(finalPrice / 10);
  
  // آپدیت نمایش قیمت — این رو بر اساس ساختار خودت عوض کن
  const priceEl = priceCard.querySelector('.price-value');
  if (priceEl) {
    priceEl.textContent = toman.toLocaleString('fa-IR') + ' تومان';
  }
}
```

---

## 6. تست و دیباگ

### 6.1 تست استعلام
1. سرور رو اجرا کن: `node server-proxy.js`
2. مرورگر رو باز کن: `http://localhost:5000`
3. شماره موبایل مشتری تست رو وارد کن
4. دکمه "استعلام" رو بزن

### 6.2 تست با cURL
```bash
# تست استعلام
curl -X POST http://localhost:5000/api/club/inquiry \
  -H "Content-Type: application/json" \
  -d '{"mobile":"09123456789","totalPrice":500000}'

# تست استفاده از اعتبار
curl -X POST http://localhost:5000/api/club/use-credit \
  -H "Content-Type: application/json" \
  -d '{"inquiryId":123,"mobile":"09123456789","usedCredit":50000,"usedDiscountPercent":0,"totalPrice":500000}'
```

### 6.3 خطاهای رایج

| خطا | علت | راه حل |
|-----|-----|--------|
| `Login failed: 401` | نام کاربری/رمز اشتباه | CONFIG رو چک کن |
| `Login failed: 410` | کد قفل تعریف نشده | با اسمارت تماس بگیر |
| `NotFoundMobile (-3)` | موبایل ثبت نشده | مشتری باید ابتدا عضو بشه |
| `NotFoundCode (-2)` | کد باشگاه اشتباه | کد رو چک کن |
| `CustomerIdBlocked (-4)` | حساب مسدود | با پشتیبانی تماس بگیر |
| `CORS Error` | پراکسی کار نمیکنه | مطمئن شو سرور روشنه |

---

## 7. نکات امنیتی

⚠️ **مهم:**
1. هرگز `USERNAME` و `PASSWORD` رو توی فرانت‌اند نذار
2. از environment variables استفاده کن:
   ```bash
   SMART_USERNAME=ali SMART_PASSWORD=123 node server-proxy.js
   ```
3. HTTPS حتماً فعال باشه
4. Rate limiting اضافه کن (جلوگیری از حمله brute force)
5. `UsedCreditRequestId` رو همیشه ذخیره کن (برای بازگشت اعتبار)

---

## 📊 خلاصه API‌ها

| عملیات | اندپوینت پراکسی | اندپوینت اسمارت |
|--------|-----------------|----------------|
| استعلام اعتبار | `POST /api/club/inquiry` | `ClubPosClient/GetCustomerInquiry` |
| استفاده از اعتبار | `POST /api/club/use-credit` | `ClubPosClient/UsedCredit` |
| بازگشت اعتبار | `POST /api/club/undo-credit` | `ClubPosClient/UndoUsedCredit` |
| اعتبارهای فعال | `POST /api/club/active-credits` | `ClubPosClient/GetCustomerActiveCredit` |

---

## 🆘 سوال دارید؟
اگه مشکلی داری یا کمک لازم داری، بگو تا کمکت کنم! 🎂
