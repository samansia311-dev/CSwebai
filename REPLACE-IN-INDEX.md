# 🔧 Exact Changes to Make in index.html

## You need to make 3 changes:

---

## CHANGE 1: Replace the "Coming Soon" discount section (line 814-825)

### FIND this code (around line 814):
```html
      <!-- DISCOUNT -->
      <div class="discount-wrap">
        <label class="label-float">کد تخفیف</label>
        <div class="discount-coming">
          <span class="discount-coming-icon">🎁</span>
          <div class="discount-coming-text">
            <div class="discount-coming-title">کد تخفیف — به زودی</div>
            <div class="discount-coming-sub">سیستم تخفیف در حال راه‌اندازی است</div>
          </div>
          <div class="discount-coming-badge">Coming Soon</div>
        </div>
      </div>
```

### REPLACE with the club widget HTML (see club-widget-snippet.html)

---

## CHANGE 2: Add club discount to the price calculation (line 1066)

### FIND:
```javascript
let lastPrice=0;
```

### REPLACE with:
```javascript
let lastPrice=0;
let clubDiscountAmount=0;
```

---

## CHANGE 3: Add club credit call in the submit handler (line 1245)

### FIND:
```javascript
    if(res.ok&&json.success){
      sessionStorage.removeItem('cakeFormState');
      document.getElementById('orderId').textContent=`کد پیگیری: #${Date.now().toString().slice(-6)}`;
      document.getElementById('successWrap').classList.add('show');
    }
```

### REPLACE with:
```javascript
    if(res.ok&&json.success){
      // Apply club credit if enabled
      if(clubState && clubState.creditUsed){
        const factorId = Date.now();
        await applyClubCredit(factorId);
      }
      sessionStorage.removeItem('cakeFormState');
      document.getElementById('orderId').textContent=`کد پیگیری: #${Date.now().toString().slice(-6)}`;
      document.getElementById('successWrap').classList.add('show');
    }
```
