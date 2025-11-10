# Orbo Apps API Documentation

**Last Updated:** 8 ноября 2025  
**Version:** MVP (Week 1)  
**Base URL:** `https://app.orbo.ru/api`

---

## 🔐 **Authentication:**

All endpoints require authentication via Supabase session cookie.

**Headers:**
- Session managed automatically by Supabase client
- No manual headers required for browser requests

**Errors:**
- `401 Unauthorized` - Not logged in
- `403 Forbidden` - No access to resource (not a member of org)
- `404 Not Found` - Resource doesn't exist
- `500 Internal Server Error` - Server error

---

## 📦 **Apps Endpoints:**

### **GET /api/apps**
List all apps for an organization.

**Query Parameters:**
- `orgId` (required): UUID of organization

**Response:**
```json
{
  "apps": [
    {
      "id": "uuid",
      "org_id": "uuid",
      "name": "Барахолка",
      "description": "Доска объявлений для продажи вещей",
      "icon": "📦",
      "app_type": "classifieds",
      "config": { ... },
      "status": "active",
      "created_by": "uuid",
      "created_at": "2025-11-08T12:00:00Z",
      "updated_at": "2025-11-08T12:00:00Z"
    }
  ]
}
```

---

### **POST /api/apps**
Create a new app (admins/owners only).

**Body:**
```json
{
  "orgId": "uuid",
  "name": "Барахолка",
  "description": "Доска объявлений",
  "icon": "📦",
  "appType": "classifieds",
  "config": {
    "telegram_commands": ["/post", "/my_ads"],
    "notifications": { "new_item": true, "moderation": true }
  }
}
```

**Response:** `201 Created`
```json
{
  "app": { ...app object... }
}
```

---

### **GET /api/apps/[appId]**
Get app details.

**Response:**
```json
{
  "app": { ...app object... }
}
```

---

### **PATCH /api/apps/[appId]**
Update app (admins/owners only).

**Body:**
```json
{
  "name": "New Name",
  "description": "New description",
  "icon": "🎯",
  "config": { ... },
  "status": "active" | "paused" | "archived"
}
```

**Response:**
```json
{
  "app": { ...updated app object... }
}
```

---

### **DELETE /api/apps/[appId]**
Delete app (owners only). Cascades to collections, items, reactions, comments.

**Response:**
```json
{
  "success": true
}
```

---

## 📚 **Collections Endpoints:**

### **GET /api/apps/[appId]/collections**
Get all collections (data models) for an app.

**Response:**
```json
{
  "collections": [
    {
      "id": "uuid",
      "app_id": "uuid",
      "name": "listings",
      "display_name": "Объявления",
      "icon": "📦",
      "schema": {
        "fields": [
          {
            "name": "title",
            "type": "text",
            "required": true,
            "label": "Название"
          },
          {
            "name": "price",
            "type": "number",
            "required": false,
            "label": "Цена"
          },
          {
            "name": "category",
            "type": "select",
            "options": ["Авто", "Техника", "Одежда"],
            "label": "Категория"
          },
          {
            "name": "photos",
            "type": "images",
            "max": 5,
            "label": "Фотографии"
          }
        ]
      },
      "permissions": {
        "create": ["member"],
        "read": ["all"],
        "edit": ["owner", "admin"],
        "delete": ["owner", "admin"],
        "moderate": ["admin", "moderator"]
      },
      "workflows": [
        {
          "trigger": "onCreate",
          "action": "notify_moderators",
          "condition": "status=pending"
        },
        {
          "trigger": "onApprove",
          "action": "post_to_telegram"
        }
      ],
      "views": ["list", "grid", "map"],
      "moderation_enabled": true,
      "created_at": "2025-11-08T12:00:00Z",
      "updated_at": "2025-11-08T12:00:00Z"
    }
  ]
}
```

---

## 📄 **Items Endpoints:**

### **GET /api/apps/[appId]/items**
List items in an app.

**Query Parameters:**
- `collectionId` (optional): Filter by collection
- `status` (optional): Filter by status (`pending`, `active`, `rejected`, `sold`, `archived`)
- `search` (optional): Search in title/description
- `limit` (optional, default 50): Max items to return
- `offset` (optional, default 0): Pagination offset

**Response:**
```json
{
  "items": [
    {
      "id": "uuid",
      "collection_id": "uuid",
      "data": {
        "title": "Продаю iPhone 13",
        "price": 45000,
        "category": "Техника",
        "description": "Отличное состояние...",
        "contact": "@username"
      },
      "images": [
        "https://...url1.jpg",
        "https://...url2.jpg"
      ],
      "files": [],
      "location_lat": 55.7558,
      "location_lon": 37.6173,
      "location_address": "Москва",
      "status": "active",
      "creator_id": "uuid",
      "org_id": "uuid",
      "moderated_by": "uuid",
      "moderated_at": "2025-11-08T12:05:00Z",
      "moderation_note": null,
      "views_count": 42,
      "reactions_count": 5,
      "created_at": "2025-11-08T12:00:00Z",
      "updated_at": "2025-11-08T12:05:00Z",
      "expires_at": null
    }
  ],
  "total": 147,
  "limit": 50,
  "offset": 0
}
```

---

### **POST /api/apps/[appId]/items**
Create a new item.

**Body:**
```json
{
  "collectionId": "uuid",
  "data": {
    "title": "Продаю Honda Civic",
    "price": 650000,
    "category": "Авто",
    "description": "2015 год, пробег 80к км",
    "contact": "@ivan"
  },
  "images": [
    "https://...url1.jpg",
    "https://...url2.jpg"
  ],
  "files": [],
  "locationLat": 55.7558,
  "locationLon": 37.6173,
  "locationAddress": "Москва, СВАО"
}
```

**Response:** `201 Created`
```json
{
  "item": { ...item object... }
}
```

**Notes:**
- If `moderation_enabled` for collection → `status` = `"pending"`
- Otherwise → `status` = `"active"`

---

### **GET /api/apps/[appId]/items/[itemId]**
Get item details. Increments `views_count`.

**Response:**
```json
{
  "item": { ...item object... }
}
```

---

### **PATCH /api/apps/[appId]/items/[itemId]**
Update item.

**Permissions:**
- **Owner (creator):** Can edit `data`, `images`, `files`, `location*`
- **Moderators:** Can change `status`

**Body:**
```json
{
  "data": { ...updated data... },
  "images": [...updated images...],
  "locationLat": 55.7558,
  "locationLon": 37.6173,
  "locationAddress": "Новый адрес",
  "status": "active" // moderators only
}
```

**Response:**
```json
{
  "item": { ...updated item object... }
}
```

---

### **DELETE /api/apps/[appId]/items/[itemId]**
Delete item. Only owner or admin can delete.

**Response:**
```json
{
  "success": true
}
```

---

## ✅ **Moderation Endpoint:**

### **POST /api/apps/[appId]/items/[itemId]/moderate**
Approve or reject item (moderators only).

**Body:**
```json
{
  "action": "approve" | "reject",
  "note": "Причина отклонения (optional)"
}
```

**Response:**
```json
{
  "item": {
    ...item object with updated status...
    "status": "active" | "rejected",
    "moderated_by": "uuid",
    "moderated_at": "2025-11-08T12:10:00Z",
    "moderation_note": "Нарушение правил"
  }
}
```

**Side Effects:**
- Logs admin action
- Logs analytics event
- TODO: Sends notification to creator
- TODO: If approved → posts to Telegram group

---

## 📤 **Upload Endpoints:**

### **POST /api/apps/[appId]/upload**
Upload file (image/video/PDF).

**Headers:**
- `Content-Type: multipart/form-data`

**Body (FormData):**
- `file`: File object (max 10MB)

**Allowed Types:**
- Images: `image/jpeg`, `image/png`, `image/gif`, `image/webp`
- Videos: `video/mp4`, `video/quicktime`
- Documents: `application/pdf`

**Response:**
```json
{
  "success": true,
  "url": "https://...supabase.co/storage/v1/object/public/app-files/...",
  "path": "org_id/apps/app_id/timestamp-random.jpg",
  "fileName": "original-name.jpg",
  "fileSize": 1234567,
  "fileType": "image/jpeg"
}
```

**Errors:**
- `400 Bad Request` - No file, file too large, or invalid type
- `500 Internal Server Error` - Upload failed or bucket not configured

---

### **DELETE /api/apps/[appId]/upload**
Delete uploaded file.

**Query Parameters:**
- `path` (required): File path returned from upload

**Response:**
```json
{
  "success": true
}
```

---

## 🔄 **Typical Workflows:**

### **1. Create App with AI Constructor (Week 2)**
```
POST /api/ai/chat → conversation
POST /api/ai/generate-app → config JSON
POST /api/apps → create app + collections
```

### **2. Member Creates Item (Classifieds)**
```
POST /api/apps/[appId]/upload → upload photos
POST /api/apps/[appId]/items → create listing (status=pending)
```

### **3. Moderator Approves Item**
```
GET /api/apps/[appId]/items?status=pending → get pending items
POST /api/apps/[appId]/items/[itemId]/moderate { action: "approve" }
→ status=active, posted to Telegram
```

### **4. User Views Items**
```
GET /api/apps/[appId]/collections → get schema
GET /api/apps/[appId]/items?status=active&limit=50 → list items
GET /api/apps/[appId]/items/[itemId] → view details
```

### **5. User Edits Own Item**
```
PATCH /api/apps/[appId]/items/[itemId] { data: {...} }
→ updated
```

---

## 🛡️ **RLS (Row Level Security):**

All tables use RLS for tenant isolation:

**apps:**
- `SELECT`: Members of org
- `INSERT`: Admins/owners of org
- `UPDATE`: Admins/owners of org
- `DELETE`: Owners of org

**app_collections:**
- `SELECT`: Members of org (via app)

**app_items:**
- `SELECT`: Members of org
- `INSERT`: Members of org (creator_id = user_id)
- `UPDATE`: Owner (creator) OR moderators
- `DELETE`: Owner (creator) OR admins

**app_item_reactions:**
- `SELECT`: Members of org
- `INSERT`: Members of org (user_id = self, once per item)
- `DELETE`: Own reactions

**app_item_comments:**
- `SELECT`: Members of org
- `INSERT`: Members of org (user_id = self)
- `UPDATE/DELETE`: Own comments OR moderators

---

## 📊 **Analytics Events:**

Logged via `log_app_event(p_app_id, p_event_type, p_user_id, p_item_id, p_collection_id, p_data)`:

- `item_created`
- `item_viewed`
- `item_updated`
- `item_approved`
- `item_rejected`
- `item_deleted`

Used for:
- Admin dashboard (items created per day, etc)
- Usage metrics (MAU, retention)
- A/B testing (future)

---

## 🚀 **Next Steps (Week 2-4):**

### **Week 2: AI Constructor**
- `POST /api/ai/chat` - AI conversation
- `POST /api/ai/generate-app` - Generate app config

### **Week 3: Reactions & Comments**
- `POST /api/apps/[appId]/items/[itemId]/react` - Add reaction
- `GET /api/apps/[appId]/items/[itemId]/comments` - List comments
- `POST /api/apps/[appId]/items/[itemId]/comments` - Add comment

### **Week 4: Telegram Integration**
- Telegram bot commands (`/post`, `/my_ads`)
- Webhook handlers for bot interactions
- Notification service (post to group, DM to user)

---

## 📝 **Notes:**

- All endpoints use structured logging (Pino)
- Admin actions logged to `admin_action_log`
- File uploads stored in Supabase Storage (`app-files` bucket)
- JSONB fields allow flexible schemas without migrations
- GIN indexes on `data` column for fast JSONB queries
- Geo queries use simple composite index (PostGIS for v2)

---

**Status:** ✅ Week 1 Complete  
**API Endpoints Created:** 12  
**Ready for Week 2:** AI Constructor integration

