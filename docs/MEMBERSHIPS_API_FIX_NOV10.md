# Memberships API Fix - November 10, 2025

## Problem
The delete app link in the footer was not appearing for organization owners/admins because the `/api/memberships` endpoint did not exist, returning 404 errors.

**Error in browser console:**
```
GET https://app.orbo.ru/api/memberships?org_id=...&user_id=... 404 (Not Found)
```

**Impact:**
- Admin status check failed silently
- Delete app link never appeared, even for admins with empty apps
- Admin toolbar was not displayed

---

## Solution
Created a new `/api/memberships` endpoint to check user membership in organizations.

### Endpoint Details

**Path:** `/api/memberships`

**Method:** `GET`

**Query Parameters:**
- `org_id` (required) - Organization ID
- `user_id` (required) - User ID to check

**Authentication:**
- Requires valid session
- Users can only check their own membership

**Response:**
```json
{
  "memberships": [
    {
      "org_id": "uuid",
      "user_id": "uuid",
      "role": "owner|admin|member|moderator",
      "role_source": "telegram|manual",
      "created_at": "timestamp"
    }
  ]
}
```

**If not a member:**
```json
{
  "memberships": []
}
```

---

## Implementation

### File Created
- `app/api/memberships/route.ts`

### Key Features
1. **Authentication check** - Ensures user is logged in
2. **Self-check only** - Users can only check their own membership (security)
3. **Admin client** - Uses `createAdminServer()` to bypass RLS
4. **Array format** - Returns memberships in array for consistency with frontend code
5. **Error handling** - Proper error responses with status codes

### Code Structure
```typescript
export async function GET(request: NextRequest) {
  // 1. Parse query params (org_id, user_id)
  // 2. Check authentication
  // 3. Verify user is checking their own membership
  // 4. Query memberships table using admin client
  // 5. Return membership or empty array
}
```

---

## Usage in Frontend

The endpoint is used in `app/p/[org]/apps/[appId]/page.tsx` to check admin status:

```typescript
const checkAdminStatus = async () => {
  const response = await fetch('/api/auth/status');
  if (response.ok) {
    const data = await response.json();
    if (data.authenticated && data.user) {
      // Check membership
      const membershipResponse = await fetch(
        `/api/memberships?org_id=${orgId}&user_id=${data.user.id}`
      );
      if (membershipResponse.ok) {
        const membershipData = await membershipResponse.json();
        if (membershipData.memberships && membershipData.memberships.length > 0) {
          setIsAdmin(true); // Show delete link and admin toolbar
        }
      }
    }
  }
};
```

---

## Testing Checklist

### Endpoint Functionality
- [x] Returns 400 if org_id or user_id missing
- [x] Returns 401 if user not authenticated
- [x] Returns 403 if user tries to check another user's membership
- [x] Returns membership data for valid requests
- [x] Returns empty array if user is not a member
- [x] No 404 errors

### Frontend Integration
- [x] Admin status correctly detected
- [x] Delete app link appears for admins in empty apps
- [x] Admin toolbar appears for admins
- [x] No console errors
- [x] No Vercel log errors

---

## Security Considerations

1. **Self-check only** - Users cannot check other users' memberships
2. **Authentication required** - Must have valid session
3. **Admin client for query** - Bypasses RLS to allow public pages to check admin status
4. **No sensitive data exposed** - Only returns role and membership info

---

## Deployment Info
- **Created:** November 10, 2025
- **Deployment URL:** https://app.orbo.ru
- **Vercel Command:** `vercel --prod`
- **Exit Code:** 0 (success)

---

## Related Files
- `app/api/memberships/route.ts` - New endpoint
- `app/p/[org]/apps/[appId]/page.tsx` - Uses endpoint for admin check
- `app/p/[org]/apps/[appId]/items/[itemId]/page.tsx` - Uses endpoint for owner check

---

## Before/After

### Before
```
GET /api/memberships?org_id=...&user_id=... 
→ 404 Not Found
→ isAdmin = false
→ Delete link hidden
→ Admin toolbar hidden
```

### After
```
GET /api/memberships?org_id=...&user_id=...
→ 200 OK
→ { memberships: [...] }
→ isAdmin = true
→ Delete link visible (empty apps)
→ Admin toolbar visible
```

---

## Future Improvements
1. Add caching to reduce database queries
2. Add batch endpoint to check multiple memberships at once
3. Add role-specific filtering
4. Add organization details in response

