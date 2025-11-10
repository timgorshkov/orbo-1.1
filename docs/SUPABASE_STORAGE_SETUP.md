# Supabase Storage Setup for Orbo Apps

**Purpose:** Store images, videos, and files for app items (listings, issues, etc)  
**Bucket Name:** `app-files`  
**Access:** Public (read), Authenticated (write with RLS)

---

## 🪣 **1. Create Storage Bucket:**

### **Via Supabase Dashboard:**

1. Go to https://supabase.com/dashboard/project/YOUR_PROJECT_ID/storage/buckets
2. Click **"New bucket"**
3. Settings:
   - **Name:** `app-files`
   - **Public bucket:** ✅ **Yes** (for public URLs)
   - **File size limit:** `10 MB`
   - **Allowed MIME types:** Leave empty (we validate in API)

4. Click **"Create bucket"**

---

## 🔐 **2. Configure RLS Policies:**

### **Policy 1: Public Read**
Anyone can view files (public URLs).

```sql
CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
USING (bucket_id = 'app-files');
```

### **Policy 2: Authenticated Upload**
Only authenticated org members can upload files to their org's folder.

```sql
CREATE POLICY "Authenticated users can upload to their org"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'app-files'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] IN (
    SELECT org_id::text
    FROM memberships
    WHERE user_id = auth.uid()
  )
);
```

### **Policy 3: Owners Can Delete**
Users can delete files they uploaded OR admins can delete files in their org.

```sql
CREATE POLICY "Users can delete own files or org admins can delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'app-files'
  AND (
    auth.uid() = owner
    OR (storage.foldername(name))[1] IN (
      SELECT org_id::text
      FROM memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  )
);
```

---

## 📂 **3. File Path Structure:**

Files are organized by org and app:

```
app-files/
├── {org_id}/
│   ├── apps/
│   │   ├── {app_id}/
│   │   │   ├── 1699999999-abc123.jpg
│   │   │   ├── 1699999999-def456.png
│   │   │   └── ...
```

**Example:**
```
app-files/a3e8bc8f-8171-472c-a955-2f7878aed6f1/apps/550e8400-e29b-41d4-a716-446655440000/1699999999-abc123.jpg
```

**Public URL:**
```
https://lyijgcnrwnwusvxzeiwv.supabase.co/storage/v1/object/public/app-files/a3e8bc8f-8171-472c-a955-2f7878aed6f1/apps/550e8400-e29b-41d4-a716-446655440000/1699999999-abc123.jpg
```

---

## 🧪 **4. Test Upload (via API):**

### **Using curl:**
```bash
curl -X POST https://app.orbo.ru/api/apps/{APP_ID}/upload \
  -H "Cookie: sb-lyijgcnrwnwusvxzeiwv-auth-token=YOUR_TOKEN" \
  -F "file=@path/to/image.jpg"
```

### **Response:**
```json
{
  "success": true,
  "url": "https://...supabase.co/.../image.jpg",
  "path": "org_id/apps/app_id/1699999999-abc123.jpg",
  "fileName": "image.jpg",
  "fileSize": 123456,
  "fileType": "image/jpeg"
}
```

---

## 📊 **5. Storage Quotas & Pricing:**

### **Supabase Free Tier:**
- **Storage:** 1 GB
- **Transfer:** 2 GB/month
- **File size limit:** 50 MB (we set 10 MB in API)

### **Supabase Pro Tier ($25/month):**
- **Storage:** 100 GB (then $0.021/GB/month)
- **Transfer:** 200 GB/month (then $0.09/GB)
- **File size limit:** 5 GB

### **Estimate for MVP (50-100 users, 500-1000 items):**
- Average 3 images per item, 500 KB each
- 1000 items × 3 images × 0.5 MB = **1.5 GB storage**
- Transfer: ~5 GB/month → **within Free tier**

### **Estimate for Scale (1000 users, 10,000 items):**
- 10,000 items × 3 images × 0.5 MB = **15 GB storage**
- Transfer: ~50 GB/month → **Pro tier needed**

---

## 🔄 **6. Future Optimizations:**

### **Image Resizing (v1.2):**
Use Supabase Image Transformations:
```
https://...supabase.co/.../image.jpg?width=800&height=600&quality=80
```

### **CDN (v1.3):**
Add Cloudflare or Supabase CDN for faster delivery.

### **Migration to Selectel (v2.0):**
When migrating data to Russian servers:
1. Setup Selectel S3-compatible storage
2. Dual-write during transition
3. Background migration of existing files
4. Update URLs in database
5. Cutover

---

## ⚠️ **7. Security Considerations:**

### **File Validation:**
- ✅ Size limit (10 MB in API)
- ✅ MIME type validation (images, videos, PDF)
- ✅ Unique filenames (timestamp + random)
- ❌ Virus scanning (TODO for production)
- ❌ Image content moderation (TODO for production)

### **Access Control:**
- ✅ RLS on storage.objects
- ✅ API validates org membership
- ✅ Public read (intentional for MVP)
- ⚠️ Consider signed URLs for private files (v2)

### **Abuse Prevention:**
- Rate limiting (TODO)
- File count limits per user (TODO)
- Storage quota per org (TODO)

---

## 📝 **8. Apply Policies (SQL):**

Run this in Supabase SQL Editor:

```sql
-- Enable RLS on storage.objects (should already be enabled)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policy 1: Public read
CREATE POLICY "Public read access on app-files"
ON storage.objects FOR SELECT
USING (bucket_id = 'app-files');

-- Policy 2: Authenticated upload to own org
CREATE POLICY "Authenticated users can upload to their org in app-files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'app-files'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] IN (
    SELECT org_id::text
    FROM memberships
    WHERE user_id = auth.uid()
  )
);

-- Policy 3: Delete own files or org admins
CREATE POLICY "Users can delete own files or org admins in app-files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'app-files'
  AND (
    auth.uid() = owner
    OR (storage.foldername(name))[1] IN (
      SELECT org_id::text
      FROM memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  )
);
```

---

## ✅ **9. Verification Checklist:**

- [ ] Bucket `app-files` created
- [ ] Public access enabled
- [ ] 3 RLS policies applied
- [ ] Test upload via API (should succeed)
- [ ] Test public URL (should load image)
- [ ] Test delete via API (should succeed)
- [ ] Test unauthorized upload (should fail with 403)

---

**Status:** 📋 To Be Applied  
**Estimated Setup Time:** 5-10 minutes  
**Next:** Test upload endpoint after bucket is created

