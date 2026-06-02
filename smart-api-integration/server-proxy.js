/**
 * 🔒 Smart API Proxy Server
 * 
 * این سرور به عنوان واسط بین فرانت‌اند و API اسمارت عمل میکنه.
 * توکن احراز هویت فقط توی سرور نگهداری میشه (امنیت بالا).
 * 
 * نصب: npm install express cors node-fetch
 * اجرا: node server-proxy.js
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// ═══════════════════════════════════════════
// ⚙️ تنظیمات — اینجا اطلاعات خودت رو وارد کن
// ═══════════════════════════════════════════
const CONFIG = {
  // آدرس پایه API ارزیابی هوشمند (سینک دیتا)
  SYNC_BASE_URL: 'https://sepidz.smartx.ir/api/v1',
  // آدرس پایه API باشگاه مشتریان  
  CLUB_BASE_URL: 'https://app.smartx.ir/api/v1',
  // نام کاربری API
  USERNAME: '922447',   // ← اینجا عوض کن
  // رمز عبور API
  PASSWORD: 'M9224471513195a',   // ← اینجا عوض کن
  // کد قفل شعبه (وقتی گرفتی اینجا بذار)
  BRANCH_CLOUD_CONSUMER_ID: 922447, // ← اینجا عوض کن
  // پورت سرور
  PORT: 5000,
};

// ═══════════════════════════════════════════
// 🔑 مدیریت توکن
// ═══════════════════════════════════════════
let tokenData = {
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
};

/**
 * دریافت توکن از API اسمارت
 */
async function getToken() {
  // اگر توکن معتبر داریم، همون رو برگردون
  if (tokenData.accessToken && tokenData.expiresAt && Date.now() < tokenData.expiresAt) {
    return tokenData.accessToken;
  }

  // اگر ریفرش توکن داریم، با اون توکن جدید بگیر
  if (tokenData.refreshToken) {
    try {
      const newToken = await refreshAccessToken(tokenData.refreshToken);
      if (newToken) return newToken;
    } catch (e) {
      console.log('Refresh token failed, getting new token...');
    }
  }

  // توکن جدید بگیر
  const fetch = (await import('node-fetch')).default;
  const response = await fetch(`${CONFIG.CLUB_BASE_URL}/Account/Login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Username: CONFIG.USERNAME,
      Password: CONFIG.PASSWORD,
    }),
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.status}`);
  }

  const result = await response.json();
  tokenData.accessToken = result.access_token;
  tokenData.refreshToken = result.refresh_token;
  // توکن رو ۵۵ دقیقه معتبر فرض میکنیم (معمولاً ۶۰ دقیقه‌ست)
  tokenData.expiresAt = Date.now() + 55 * 60 * 1000;

  console.log('✅ توکن جدید دریافت شد');
  return tokenData.accessToken;
}

/**
 * تمدید توکن با Refresh Token
 */
async function refreshAccessToken(refreshToken) {
  const fetch = (await import('node-fetch')).default;
  const response = await fetch(`${CONFIG.CLUB_BASE_URL}/Account/RefreshToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ RefreshToken: refreshToken }),
  });

  if (!response.ok) return null;

  const result = await response.json();
  tokenData.accessToken = result.access_token;
  tokenData.refreshToken = result.refresh_token;
  tokenData.expiresAt = Date.now() + 55 * 60 * 1000;

  console.log('🔄 توکن تمدید شد');
  return tokenData.accessToken;
}

// ═══════════════════════════════════════════
// 🏪 API باشگاه مشتریان — اندپوینت‌ها
// ═══════════════════════════════════════════

/**
 * ① استعلام کد باشگاه / موبایل مشتری
 * 
 * فرانت ارسال میکنه:
 *   { mobile: "09123456789", code: "ABC123", products: [...], totalPrice: 500000 }
 * 
 * یا فقط mobile یا فقط code — هر دو لازم نیست
 */
app.post('/api/club/inquiry', async (req, res) => {
  try {
    const token = await getToken();
    const { mobile, code, products, totalPrice } = req.body;

    if (!mobile && !code) {
      return res.status(400).json({ error: 'موبایل یا کد باشگاه الزامی است' });
    }

    const body = {
      BranchCloudConsumerId: CONFIG.BRANCH_CLOUD_CONSUMER_ID,
      Mobile: mobile || '',
      Code: code || '',
      TotalFacturePrice: totalPrice || 0,
      OrderType: 12, // ThirdPartyWebSite — برای سفارش از وبسایت غیر سپیدز
      posUserId: 0,
      customerInquiryRequestProductsList: (products || []).map(p => ({
        ProductId: p.productId,
        Quantity: p.quantity,
        UnitPrice: p.unitPrice,
      })),
    };

    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`${CONFIG.CLUB_BASE_URL}/ClubPosClient/GetCustomerInquiry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const result = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: 'خطا در استعلام', details: result });
    }

    // پاسخ رو به فرانت برگردون
    res.json({
      success: true,
      data: {
        inquiryId: result.InquiryId,
        customerName: result.CustomerName,
        mobile: result.LongMobile,
        wallet: result.Wallet,                    // کیف پول
        availableCredit: result.AvailableCredit,   // اعتبار قابل استفاده
        discountPercent: result.DiscountPercent,    // درصد تخفیف
        maxDiscountPrice: result.MaxUsablePriceFromDiscountPercent, // حداکثر مبلغ تخفیف درصدی
        minInvoiceAmount: result.MinInvoiceAmountToUseCredit, // حداقل مبلغ فاکتور
        message: result.Message,                   // پیام نمایشی
        groupName: result.GroupName,               // گروه مشتری (طلایی، نقره‌ای، ...)
        productDiscounts: result.ProductDiscounts,  // تخفیف محصولات
        status: result.Status,
      },
    });
  } catch (err) {
    console.error('❌ Club inquiry error:', err);
    res.status(500).json({ error: 'خطا در ارتباط با سرور اسمارت' });
  }
});

/**
 * ② استفاده از اعتبار باشگاه
 * 
 * فرانت ارسال میکنه:
 *   { inquiryId, mobile, code, factorId, usedCredit, usedDiscountPercent, products, totalPrice }
 */
app.post('/api/club/use-credit', async (req, res) => {
  try {
    const token = await getToken();
    const {
      inquiryId, mobile, code, factorId,
      usedCredit, usedDiscountPercent,
      usedProductDiscounts, products, totalPrice
    } = req.body;

    if (!inquiryId) {
      return res.status(400).json({ error: 'inquiryId الزامی است. ابتدا استعلام کنید.' });
    }

    const body = {
      InquiryId: inquiryId,
      BranchCloudConsumerId: CONFIG.BRANCH_CLOUD_CONSUMER_ID,
      Mobile: mobile || '',
      Code: code || '',
      PosUserId: '0',
      OrderType: 12, // ThirdPartyWebSite
      FactorId: factorId || 0,
      UsedCredit: usedCredit || 0,
      UsedDiscountPercent: usedDiscountPercent || 0,
      usedProductDiscounts: usedProductDiscounts || [],
      customerInquiryRequestProductsList: (products || []).map(p => ({
        ProductId: p.productId,
        Quantity: p.quantity,
        UnitPrice: p.unitPrice,
      })),
      TotalFacturePrice: totalPrice || 0,
    };

    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`${CONFIG.CLUB_BASE_URL}/ClubPosClient/UsedCredit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const result = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: 'خطا در استفاده از اعتبار', details: result });
    }

    res.json({
      success: true,
      data: {
        usedCreditRequestId: result.UsedCreditRequestId, // ⚠️ مهم: این رو توی فاکتور ذخیره کن
        burnedCredit: result.BurnedCredit,           // اعتبار خرج شده
        burnedPercentage: result.BurnedPercentage,   // تخفیف درصدی اعمال شده
        totalPrice: result.TotalFacturePrice,
        productDiscounts: result.UsedProductDiscounts,
        message: result.Message,
        status: result.Status,
      },
    });
  } catch (err) {
    console.error('❌ Use credit error:', err);
    res.status(500).json({ error: 'خطا در استفاده از اعتبار' });
  }
});

/**
 * ③ بازگشت اعتبار (لغو فاکتور)
 */
app.post('/api/club/undo-credit', async (req, res) => {
  try {
    const token = await getToken();
    const { usedCreditResponseId } = req.body;

    if (!usedCreditResponseId) {
      return res.status(400).json({ error: 'usedCreditResponseId الزامی است' });
    }

    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`${CONFIG.CLUB_BASE_URL}/ClubPosClient/UndoUsedCredit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        UsedCreditResponseId: usedCreditResponseId,
        BranchCloudConsumerId: CONFIG.BRANCH_CLOUD_CONSUMER_ID,
      }),
    });

    if (response.ok) {
      res.json({ success: true, message: 'اعتبار با موفقیت بازگردانده شد' });
    } else {
      res.status(response.status).json({ error: 'خطا در بازگشت اعتبار' });
    }
  } catch (err) {
    console.error('❌ Undo credit error:', err);
    res.status(500).json({ error: 'خطا در بازگشت اعتبار' });
  }
});

/**
 * ④ دریافت لیست اعتبارهای فعال مشتری
 */
app.post('/api/club/active-credits', async (req, res) => {
  try {
    const token = await getToken();
    const { mobile } = req.body;

    if (!mobile) {
      return res.status(400).json({ error: 'شماره موبایل الزامی است' });
    }

    // حذف صفر ابتدایی برای LongMobile
    const longMobile = parseInt(mobile.replace(/^0/, ''), 10);

    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`${CONFIG.CLUB_BASE_URL}/ClubPosClient/GetCustomerActiveCredit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        LongMobile: longMobile,
        BranchCloudConsumerId: CONFIG.BRANCH_CLOUD_CONSUMER_ID,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: 'خطا در دریافت اعتبارها' });
    }

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('❌ Active credits error:', err);
    res.status(500).json({ error: 'خطا در دریافت لیست اعتبارها' });
  }
});

// ═══════════════════════════════════════════
// 📁 سرو فایل‌های استاتیک (وبسایت cake-shop)
// ═══════════════════════════════════════════
app.use(express.static(path.join(__dirname, '../cake-shop')));

// ═══════════════════════════════════════════
// 🚀 شروع سرور
// ═══════════════════════════════════════════
app.listen(CONFIG.PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════╗
║  🎂 Cake Shop + Smart API Proxy Server       ║
║  🌐 http://localhost:${CONFIG.PORT}                   ║
║  📡 API Proxy: /api/club/*                    ║
╚══════════════════════════════════════════════╝
  `);
});
