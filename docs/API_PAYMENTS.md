# Event Payments API Documentation

## 📋 Overview

API endpoints для управления оплатами событий. Все endpoints требуют аутентификации и admin прав для организации.

---

## 🔐 Authentication

Все endpoints требуют:
- ✅ Аутентифицированного пользователя (`auth.uid()`)
- ✅ Роли `owner` или `admin` в организации

---

## 📍 Endpoints

### 1. GET /api/events/[id]/payments

**Описание:** Получить список регистраций с информацией об оплатах.

**Auth:** Admin only

**Query Parameters:**
- `status` (optional): Фильтр по статусу оплаты
  - `pending` - ожидает оплаты
  - `paid` - оплачено
  - `partially_paid` - частично оплачено
  - `overdue` - просрочено
  - `cancelled` - отменено
  - `refunded` - возвращено

**Response:**
```json
{
  "event": {
    "id": "uuid",
    "title": "Название события",
    "requires_payment": true,
    "default_price": 1000,
    "currency": "RUB",
    "payment_deadline_days": 3,
    "payment_instructions": "Реквизиты для оплаты...",
    "event_date": "2025-11-20"
  },
  "registrations": [
    {
      "id": "uuid",
      "participant_id": "uuid",
      "status": "registered",
      "registered_at": "2025-11-17T10:00:00Z",
      "price": 800,
      "payment_status": "paid",
      "payment_method": "bank_transfer",
      "paid_at": "2025-11-17T12:00:00Z",
      "paid_amount": 800,
      "payment_notes": "Оплата получена, транзакция #12345",
      "payment_updated_at": "2025-11-17T12:05:00Z",
      "payment_deadline": "2025-11-17T00:00:00Z",
      "is_overdue": false,
      "participants": {
        "id": "uuid",
        "full_name": "Иван Иванов",
        "username": "ivan_ivanov",
        "tg_user_id": "123456789",
        "photo_url": "https://..."
      }
    }
  ]
}
```

**Use Case:**
```typescript
// Получить всех участников с оплатами
const response = await fetch(`/api/events/${eventId}/payments`)

// Получить только неоплаченных
const response = await fetch(`/api/events/${eventId}/payments?status=pending`)

// Получить просроченных
const response = await fetch(`/api/events/${eventId}/payments?status=overdue`)
```

---

### 2. PATCH /api/events/[id]/payments/[registrationId]

**Описание:** Обновить информацию об оплате для конкретной регистрации.

**Auth:** Admin only

**Body Parameters:**
```typescript
{
  price?: number              // Индивидуальная цена для участника
  payment_status?: string     // pending | paid | partially_paid | overdue | cancelled | refunded
  payment_method?: string     // bank_transfer | cash | card | online | other
  paid_amount?: number        // Сумма фактически оплаченная
  payment_notes?: string      // Комментарий админа
}
```

**Automatic Fields:**
- `paid_at`: Автоматически устанавливается при `payment_status = 'paid'`
- `payment_updated_by`: ID текущего пользователя
- `payment_updated_at`: Текущее время

**Response:**
```json
{
  "success": true,
  "registration": {
    "id": "uuid",
    "participant_id": "uuid",
    "price": 800,
    "payment_status": "paid",
    "payment_method": "bank_transfer",
    "paid_at": "2025-11-17T12:00:00Z",
    "paid_amount": 800,
    "payment_notes": "Транзакция #12345",
    "payment_updated_at": "2025-11-17T12:05:00Z",
    "participants": {
      "id": "uuid",
      "full_name": "Иван Иванов",
      "username": "ivan_ivanov"
    }
  }
}
```

**Use Cases:**

```typescript
// 1. Изменить цену для конкретного участника (скидка)
await fetch(`/api/events/${eventId}/payments/${registrationId}`, {
  method: 'PATCH',
  body: JSON.stringify({ price: 500 })
})

// 2. Отметить как оплаченное
await fetch(`/api/events/${eventId}/payments/${registrationId}`, {
  method: 'PATCH',
  body: JSON.stringify({
    payment_status: 'paid',
    payment_method: 'bank_transfer',
    paid_amount: 800,
    payment_notes: 'Оплата получена, транзакция #12345'
  })
})

// 3. Частичная оплата
await fetch(`/api/events/${eventId}/payments/${registrationId}`, {
  method: 'PATCH',
  body: JSON.stringify({
    payment_status: 'partially_paid',
    paid_amount: 500,
    payment_notes: 'Внесен аванс 500 из 1000'
  })
})

// 4. Отменить оплату
await fetch(`/api/events/${eventId}/payments/${registrationId}`, {
  method: 'PATCH',
  body: JSON.stringify({
    payment_status: 'cancelled',
    payment_notes: 'Участник отменил регистрацию'
  })
})
```

---

### 3. GET /api/events/[id]/payments/stats

**Описание:** Получить статистику по оплатам события.

**Auth:** Admin only

**Response:**
```json
{
  "event": {
    "id": "uuid",
    "title": "Название события",
    "requires_payment": true,
    "default_price": 1000,
    "currency": "RUB"
  },
  "stats": {
    "total_registrations": 25,
    "total_expected_amount": 24000,
    "total_paid_amount": 18500,
    "paid_count": 20,
    "pending_count": 3,
    "overdue_count": 2,
    "payment_completion_percent": 80,
    "breakdown_by_status": {
      "paid": 20,
      "pending": 3,
      "overdue": 2
    }
  }
}
```

**Use Case:**
```typescript
// Получить статистику для дашборда
const response = await fetch(`/api/events/${eventId}/payments/stats`)
const { stats } = await response.json()

console.log(`Оплатили: ${stats.paid_count} из ${stats.total_registrations}`)
console.log(`Собрано: ${stats.total_paid_amount} из ${stats.total_expected_amount}`)
console.log(`Процент: ${stats.payment_completion_percent}%`)
```

---

## 🔄 Workflow Example

### Сценарий: Платное мероприятие с индивидуальными ценами

```typescript
// 1. Админ создает платное событие
POST /api/events
{
  "title": "Мастер-класс по React",
  "requiresPayment": true,
  "defaultPrice": 1000,
  "currency": "RUB",
  "paymentDeadlineDays": 3,
  "paymentInstructions": "Переведите на карту 1234-5678-9012-3456"
}

// 2. Участники регистрируются (price автоматически = 1000)
// Происходит через UI или напрямую в event_registrations

// 3. Админ просматривает список участников
GET /api/events/{eventId}/payments

// 4. Админ корректирует цены для некоторых участников
PATCH /api/events/{eventId}/payments/{reg1}
{ "price": 500 }  // Скидка 50%

PATCH /api/events/{eventId}/payments/{reg2}
{ "price": 0 }    // VIP, бесплатно

// 5. Участники оплачивают, админ отмечает
PATCH /api/events/{eventId}/payments/{reg1}
{
  "payment_status": "paid",
  "payment_method": "bank_transfer",
  "paid_amount": 500,
  "payment_notes": "Оплата получена"
}

// 6. Админ проверяет статистику
GET /api/events/{eventId}/payments/stats
// → { paid_count: 18, pending_count: 5, total_paid_amount: 16500 }

// 7. Админ фильтрует неоплаченных для напоминания
GET /api/events/{eventId}/payments?status=pending
// → Список участников, которым нужно напомнить
```

---

## 🚨 Error Responses

### 401 Unauthorized
```json
{ "error": "Unauthorized" }
```

### 403 Forbidden
```json
{ "error": "Only admins can view/update payment information" }
```

### 404 Not Found
```json
{ "error": "Event not found" }
// или
{ "error": "Registration not found" }
```

### 400 Bad Request
```json
{ "error": "Invalid payment_status. Must be one of: pending, paid, partially_paid, overdue, cancelled, refunded" }
```

### 500 Internal Server Error
```json
{ "error": "Internal server error" }
```

---

## 🔑 Key Features

1. **Индивидуальные цены:** Каждый участник может иметь свою цену (скидки, VIP)
2. **Автоматизация:** `paid_at` устанавливается автоматически при статусе "paid"
3. **Аудит:** `payment_updated_by` и `payment_updated_at` для отслеживания изменений
4. **Фильтрация:** Быстрый поиск по статусам оплаты
5. **Статистика:** Агрегированные данные для дашборда
6. **Deadline tracking:** Автоматический расчет `is_overdue` для каждой регистрации

---

## 📊 Database Schema

```sql
-- events table (payment config)
requires_payment      BOOLEAN
default_price         DECIMAL(10,2)
currency              VARCHAR(3)
payment_deadline_days INTEGER
payment_instructions  TEXT

-- event_registrations table (individual payment tracking)
price                 DECIMAL(10,2)  -- Individual price per participant
payment_status        VARCHAR(20)    -- pending, paid, partially_paid, overdue, cancelled, refunded
payment_method        VARCHAR(50)    -- bank_transfer, cash, card, online, other
paid_at               TIMESTAMPTZ
paid_amount           DECIMAL(10,2)
payment_notes         TEXT
payment_updated_by    UUID
payment_updated_at    TIMESTAMPTZ
```

---

**Next:** Day 3 - Admin Payment Dashboard UI 🎨

