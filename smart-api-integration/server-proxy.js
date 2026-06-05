/**
 * Smart API Proxy Server
 * 
 * این سرور به عنوان واسط بین فرانت‌اند و API اسمارت عمل میکنه.
 * توکن احراز هویت فقط توی سرور نگهداری میشه (امنیت بالا).
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const CONFIG = {
  SYNC_BASE_URL: 'https://sepidz.smartx.ir/api/v1',
  CLUB_BASE_URL: 'https://app.smartx.ir/api/v1',
  USERNAME: process.env.SMART_API_USERNAME,
  PASSWORD: process.env.SMART_API_PASSWORD,
  BRANCH_CLOUD_CONSUMER_ID: parseInt(process.env.SMART_BRANCH_ID || '0', 10),
  PORT: process.env.PORT || 5000,
};

let tokenData = {
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
};

async function getToken() {
  if (tokenData.accessToken && tokenData.expiresAt && Date.now() < tokenData.expiresAt) {
    return tokenData.accessToken;
  }

  if (tokenData.refreshToken) {
    try {
      const newToken = await refreshAccessToken(tokenData.refreshToken);
      if (newToken) return newToken;
    } catch (e) {
      console.log('Refresh token failed, getting new token...');
    }
  }

  if (!CONFIG.USERNAME || !CONFIG.PASSWORD) {
    throw new Error('SMART_API_USERNAME and SMART_API_PASSWORD environment variables are not set');
  }

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
  tokenData.expiresAt = Date.now() + 55 * 60 * 1000;

  console.log('New token received');
  return tokenData.accessToken;
}

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

  console.log('Token refreshed');
  return tokenData.accessToken;
}

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
      OrderType: 12,
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

    res.json({
      success: true,
      data: {
        inquiryId: result.InquiryId,
        customerName: result.CustomerName,
        mobile: result.LongMobile,
        wallet: result.Wallet,
        availableCredit: result.AvailableCredit,
        discountPercent: result.DiscountPercent,
        maxDiscountPrice: result.MaxUsablePriceFromDiscountPercent,
        minInvoiceAmount: result.MinInvoiceAmountToUseCredit,
        message: result.Message,
        groupName: result.GroupName,
        productDiscounts: result.ProductDiscounts,
        status: result.Status,
      },
    });
  } catch (err) {
    console.error('Club inquiry error:', err);
    res.status(500).json({ error: 'خطا در ارتباط با سرور اسمارت' });
  }
});

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
      OrderType: 12,
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
        usedCreditRequestId: result.UsedCreditRequestId,
        burnedCredit: result.BurnedCredit,
        burnedPercentage: result.BurnedPercentage,
        totalPrice: result.TotalFacturePrice,
        productDiscounts: result.UsedProductDiscounts,
        message: result.Message,
        status: result.Status,
      },
    });
  } catch (err) {
    console.error('Use credit error:', err);
    res.status(500).json({ error: 'خطا در استفاده از اعتبار' });
  }
});

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
    console.error('Undo credit error:', err);
    res.status(500).json({ error: 'خطا در بازگشت اعتبار' });
  }
});

app.post('/api/club/active-credits', async (req, res) => {
  try {
    const token = await getToken();
    const { mobile } = req.body;

    if (!mobile) {
      return res.status(400).json({ error: 'شماره موبایل الزامی است' });
    }

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
    console.error('Active credits error:', err);
    res.status(500).json({ error: 'خطا در دریافت لیست اعتبارها' });
  }
});

app.use(express.static(path.join(__dirname, '../cake-shop')));

app.listen(CONFIG.PORT, '0.0.0.0', () => {
  console.log(`Cake Shop + Smart API Proxy running on port ${CONFIG.PORT}`);
});
