# Payment Tracking API Documentation

**Date:** 7 ноября 2025  
**Status:** COMPLETE (API only)  
**Next:** UI Implementation (Day 11-14)

---

## 🎯 **Цель:**

Manual payment tracking для:
- 💰 Membership subscriptions (ежемесячные/годовые взносы)
- 🎫 Event payments (оплата за мероприятия)
- 📝 Manual recording (без интеграции с payment gateway)

---

## 📊 **Архитектура:**

### **Database Schema** ✅

**3 таблицы:**
1. **`subscriptions`** - подписки участников (monthly/quarterly/annual)
2. **`payments`** - фактические платежи (для subscriptions ИЛИ events)
3. **`payment_methods`** - способы оплаты организации (переиспользуемые)

**Migration:** `db/migrations/101_payment_tracking.sql`

---

## 📡 **API Endpoints:**

### **1. Subscriptions API** ✅

**File:** `app/api/subscriptions/route.ts`

#### **GET /api/subscriptions?orgId=xxx**
Fetch subscriptions for organization

**Response:**
```json
{
  "subscriptions": [
    {
      "id": "uuid",
      "org_id": "uuid",
      "participant_id": "uuid",
      "participant": {
        "id": "uuid",
        "full_name": "Иван Иванов",
        "tg_username": "@ivan",
        "avatar_url": "https://..."
      },
      "plan_name": "monthly",
      "amount": 1000.00,
      "currency": "RUB",
      "billing_period": "monthly",
      "status": "active",
      "start_date": "2025-11-01",
      "end_date": null,
      "next_billing_date": "2025-12-01",
      "notes": "VIP участник",
      "created_at": "2025-11-07T20:00:00Z"
    }
  ]
}
```

#### **POST /api/subscriptions**
Create new subscription

**Request:**
```json
{
  "orgId": "uuid",
  "participantId": "uuid",
  "planName": "monthly",
  "amount": 1000.00,
  "currency": "RUB",
  "billingPeriod": "monthly",
  "startDate": "2025-11-01",
  "endDate": null,
  "notes": "VIP участник"
}
```

**Response:**
```json
{
  "subscription": { /* ... */ }
}
```

#### **PATCH /api/subscriptions**
Update subscription (status, dates, notes)

**Request:**
```json
{
  "id": "uuid",
  "orgId": "uuid",
  "status": "cancelled",
  "endDate": "2025-12-31",
  "notes": "Отменен по просьбе участника"
}
```

#### **DELETE /api/subscriptions?id=xxx&orgId=xxx**
Delete subscription (owner only)

---

### **2. Payments API** ✅

**File:** `app/api/payments/route.ts`

#### **GET /api/payments?orgId=xxx&subscriptionId=xxx&eventId=xxx**
Fetch payments for organization (with optional filters)

**Response:**
```json
{
  "payments": [
    {
      "id": "uuid",
      "org_id": "uuid",
      "subscription_id": "uuid",
      "event_id": null,
      "participant_id": "uuid",
      "participant": {
        "id": "uuid",
        "full_name": "Иван Иванов"
      },
      "subscription": {
        "id": "uuid",
        "plan_name": "monthly",
        "billing_period": "monthly"
      },
      "payment_type": "subscription",
      "amount": 1000.00,
      "currency": "RUB",
      "payment_method": "bank_transfer",
      "payment_method_details": "Карта Сбербанк *1234",
      "status": "confirmed",
      "due_date": "2025-12-01",
      "paid_at": "2025-11-30T15:30:00Z",
      "notes": "Оплачено вовремя",
      "receipt_url": null,
      "created_at": "2025-11-07T20:00:00Z"
    }
  ]
}
```

#### **POST /api/payments**
Create new payment record

**Request (Subscription payment):**
```json
{
  "orgId": "uuid",
  "subscriptionId": "uuid",
  "participantId": "uuid",
  "paymentType": "subscription",
  "amount": 1000.00,
  "currency": "RUB",
  "paymentMethod": "bank_transfer",
  "paymentMethodDetails": "Карта Сбербанк *1234",
  "dueDate": "2025-12-01",
  "paidAt": "2025-11-30T15:30:00Z",
  "status": "confirmed",
  "notes": "Оплачено вовремя"
}
```

**Request (Event payment):**
```json
{
  "orgId": "uuid",
  "eventId": "uuid",
  "participantId": "uuid",
  "paymentType": "event",
  "amount": 500.00,
  "currency": "RUB",
  "paymentMethod": "cash",
  "status": "confirmed",
  "paidAt": "2025-11-07T18:00:00Z"
}
```

#### **PATCH /api/payments**
Update payment (mark as confirmed, add receipt, etc.)

**Request:**
```json
{
  "id": "uuid",
  "orgId": "uuid",
  "status": "confirmed",
  "paidAt": "2025-11-30T15:30:00Z",
  "notes": "Оплачено через СБП",
  "receiptUrl": "https://storage.example.com/receipt.pdf"
}
```

**Note:** If `status` is set to `'confirmed'` and `paidAt` is not provided, it will be automatically set to current timestamp.

---

### **3. Payment Methods API** ✅

**File:** `app/api/payment-methods/route.ts`

#### **GET /api/payment-methods?orgId=xxx**
Fetch payment methods for organization

**Response:**
```json
{
  "paymentMethods": [
    {
      "id": "uuid",
      "org_id": "uuid",
      "method_type": "bank_transfer",
      "display_name": "Карта Сбербанк *1234",
      "instructions": "Перевод на карту 1234 5678 9012 3456\nПолучатель: Иванов Иван Иванович",
      "is_active": true,
      "created_at": "2025-11-07T20:00:00Z"
    }
  ]
}
```

#### **POST /api/payment-methods**
Create new payment method

**Request:**
```json
{
  "orgId": "uuid",
  "methodType": "bank_transfer",
  "displayName": "Карта Сбербанк *1234",
  "instructions": "Перевод на карту 1234 5678 9012 3456\nПолучатель: Иванов Иван Иванович",
  "isActive": true
}
```

#### **PATCH /api/payment-methods**
Update payment method

**Request:**
```json
{
  "id": "uuid",
  "orgId": "uuid",
  "displayName": "Карта Сбербанк *5678",
  "instructions": "Новые реквизиты...",
  "isActive": false
}
```

#### **DELETE /api/payment-methods?id=xxx&orgId=xxx**
Delete payment method (owner only)

---

## 🔐 **Permissions:**

| Action | Owner | Admin | Member |
|--------|-------|-------|--------|
| **Subscriptions** |
| View (SELECT) | ✅ | ✅ | ✅ |
| Create (INSERT) | ✅ | ✅ | ❌ |
| Update (PATCH) | ✅ | ✅ | ❌ |
| Delete (DELETE) | ✅ | ❌ | ❌ |
| **Payments** |
| View (SELECT) | ✅ | ✅ | ✅ |
| Create (INSERT) | ✅ | ✅ | ❌ |
| Update (PATCH) | ✅ | ✅ | ❌ |
| Delete | ✅ | ❌ | ❌ |
| **Payment Methods** |
| View (SELECT) | ✅ | ✅ | ✅ |
| Create (INSERT) | ✅ | ✅ | ❌ |
| Update (PATCH) | ✅ | ✅ | ❌ |
| Delete (DELETE) | ✅ | ❌ | ❌ |

---

## 📝 **Enums:**

### **Subscription Status**
```typescript
type SubscriptionStatus = 'pending' | 'active' | 'expired' | 'cancelled';
```

### **Billing Period**
```typescript
type BillingPeriod = 'monthly' | 'quarterly' | 'annual' | 'one-time';
```

### **Payment Type**
```typescript
type PaymentType = 'subscription' | 'event' | 'other';
```

### **Payment Status**
```typescript
type PaymentStatus = 'pending' | 'confirmed' | 'failed' | 'refunded';
```

### **Payment Method Type**
```typescript
type PaymentMethodType = 'bank_transfer' | 'card' | 'cash' | 'online' | 'other';
```

---

## 🧪 **Testing API:**

### **1. Create Subscription**
```bash
curl -X POST https://app.orbo.ru/api/subscriptions \
  -H "Content-Type: application/json" \
  -H "Cookie: ..." \
  -d '{
    "orgId": "your-org-id",
    "participantId": "participant-id",
    "planName": "monthly",
    "amount": 1000.00,
    "billingPeriod": "monthly",
    "startDate": "2025-11-01"
  }'
```

### **2. Record Payment**
```bash
curl -X POST https://app.orbo.ru/api/payments \
  -H "Content-Type: application/json" \
  -H "Cookie: ..." \
  -d '{
    "orgId": "your-org-id",
    "subscriptionId": "subscription-id",
    "paymentType": "subscription",
    "amount": 1000.00,
    "paymentMethod": "bank_transfer",
    "status": "confirmed",
    "paidAt": "2025-11-30T15:30:00Z"
  }'
```

### **3. Mark Payment as Confirmed**
```bash
curl -X PATCH https://app.orbo.ru/api/payments \
  -H "Content-Type: application/json" \
  -H "Cookie: ..." \
  -d '{
    "id": "payment-id",
    "orgId": "your-org-id",
    "status": "confirmed"
  }'
```

---

## ✅ **Features:**

- ✅ **Structured Logging** (Pino) - all endpoints log actions
- ✅ **Admin Action Audit** - all CRUD operations logged to `admin_action_log`
- ✅ **RLS Policies** - proper permission checks (owner/admin/member)
- ✅ **Auto-calculation** - `next_billing_date` calculated automatically
- ✅ **Auto-timestamp** - `paid_at` set automatically when marking as confirmed
- ✅ **Flexible payments** - support both subscription and event payments
- ✅ **Reusable payment methods** - store payment instructions for reuse

---

## 📋 **Файлы созданы:**

- ✅ `db/migrations/101_payment_tracking.sql` - Schema
- ✅ `app/api/subscriptions/route.ts` - Subscriptions API
- ✅ `app/api/payments/route.ts` - Payments API
- ✅ `app/api/payment-methods/route.ts` - Payment Methods API
- ✅ `docs/PAYMENT_TRACKING_API.md` - This doc

---

## 🚀 **Deploy:**

```bash
git add db/migrations/101_payment_tracking.sql app/api/subscriptions/route.ts app/api/payments/route.ts app/api/payment-methods/route.ts docs/PAYMENT_TRACKING_API.md

git commit -m "feat: Add Payment Tracking API (subscriptions, payments, payment-methods)

Week 2 Day 8-10: Schema + API complete

- Migration 101: subscriptions, payments, payment_methods tables
- API endpoints: GET/POST/PATCH/DELETE for all 3 resources
- RLS policies: owner/admin/member permissions
- Structured logging + admin action audit
- Support for subscription and event payments"

git push
```

---

## 🔜 **Next Steps: Day 11-14 - UI Implementation**

После деплоя API, создадим UI:
1. **Day 11-12:** Subscriptions UI (список, создание, редактирование)
2. **Day 13-14:** Payments UI (запись платежей, история)

Хотите продолжить с UI сейчас, или сначала задеплоим и протестируем API? 🤔

