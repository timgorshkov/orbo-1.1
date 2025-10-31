# TODO: Implement Automatic Participant Scoring

**Priority**: Medium  
**Status**: Planned  
**Created**: 2025-10-31

---

## Background

The `participants` table has `activity_score` and `risk_score` columns that are:
- ✅ Used in 73 places across 20 files (Dashboard, Analytics, Participants List)
- ❌ Currently all zeros (calculation functions exist but never called)

**Calculation Functions Exist**:
- `calculate_activity_score(participant_id UUID)` - defined in migration 09
- `calculate_risk_score(participant_id UUID)` - defined in migration 09

---

## Problem

These scores are critical for:
1. **Dashboard**: `components/dashboard/attention-zones.tsx` - shows at-risk participants
2. **Analytics**: `app/api/telegram/analytics/data/route.ts` - includes scores in analytics
3. **Participants UI**: Sorting and filtering by activity/risk

But they're never calculated, so:
- Dashboard "At Risk" section is always empty
- Analytics shows all zeros
- Sorting by activity/risk doesn't work

---

## Solution

### Option 1: Trigger-Based (Recommended)

Automatically recalculate scores when `last_activity_at` changes:

```sql
-- Migration: Add triggers for automatic score calculation

CREATE OR REPLACE FUNCTION update_participant_scores_trigger()
RETURNS TRIGGER AS $$
BEGIN
  -- Only recalculate if last_activity_at changed or is new insert
  IF TG_OP = 'INSERT' OR OLD.last_activity_at IS DISTINCT FROM NEW.last_activity_at THEN
    -- Calculate activity score
    NEW.activity_score := calculate_activity_score(NEW.id);
    
    -- Calculate risk score
    NEW.risk_score := calculate_risk_score(NEW.id);
    
    RAISE DEBUG 'Updated scores for participant %: activity=%, risk=%', 
                NEW.id, NEW.activity_score, NEW.risk_score;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_participant_scores
  BEFORE INSERT OR UPDATE OF last_activity_at ON participants
  FOR EACH ROW
  EXECUTE FUNCTION update_participant_scores_trigger();
```

**Pros**:
- ✅ Real-time updates
- ✅ No manual intervention
- ✅ Efficient (only triggers on activity changes)

**Cons**:
- ⚠️ Adds overhead to each UPDATE
- ⚠️ Calculation functions must be fast

---

### Option 2: Scheduled Job (Alternative)

Run a periodic job to recalculate all scores:

```sql
-- Function to recalculate all participant scores
CREATE OR REPLACE FUNCTION recalculate_all_participant_scores()
RETURNS TABLE (
  updated_count INTEGER,
  duration_ms INTEGER
) AS $$
DECLARE
  start_time TIMESTAMP;
  end_time TIMESTAMP;
  affected_rows INTEGER;
BEGIN
  start_time := clock_timestamp();
  
  UPDATE participants p
  SET 
    activity_score = calculate_activity_score(p.id),
    risk_score = calculate_risk_score(p.id)
  WHERE p.last_activity_at IS NOT NULL;
  
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  end_time := clock_timestamp();
  
  RETURN QUERY SELECT 
    affected_rows,
    EXTRACT(MILLISECONDS FROM (end_time - start_time))::INTEGER;
END;
$$ LANGUAGE plpgsql;

-- Grant execute to cron job
GRANT EXECUTE ON FUNCTION recalculate_all_participant_scores() TO service_role;
```

**Vercel Cron Job** (add to `vercel.json`):
```json
{
  "crons": [{
    "path": "/api/cron/update-scores",
    "schedule": "0 3 * * *"
  }]
}
```

**API Route** (`app/api/cron/update-scores/route.ts`):
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminServer } from '@/lib/server/supabaseServer';

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminServer();
  
  const { data, error } = await supabase.rpc('recalculate_all_participant_scores');
  
  if (error) {
    console.error('[Cron] Score update failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  console.log(`[Cron] Updated ${data?.updated_count} scores in ${data?.duration_ms}ms`);
  
  return NextResponse.json({ 
    success: true, 
    updated: data?.updated_count,
    duration_ms: data?.duration_ms
  });
}
```

**Pros**:
- ✅ No overhead on regular operations
- ✅ Can batch process efficiently
- ✅ Easier to monitor/debug

**Cons**:
- ❌ Not real-time (scores lag by up to 24 hours)
- ❌ Requires cron job setup

---

## Recommendation

**Start with Option 1 (Trigger)** because:
1. Scores need to be current for Dashboard alerts
2. Activity updates are not that frequent (won't cause significant overhead)
3. Simpler to implement (no cron job infrastructure)

**If performance becomes an issue**, add:
- Debouncing (only recalculate if > 1 hour since last calculation)
- Background job for bulk recalculation (one-time)

---

## Implementation Checklist

- [ ] Create migration with trigger function
- [ ] Test trigger with sample data
- [ ] Run one-time bulk recalculation for existing participants
- [ ] Verify Dashboard shows at-risk participants
- [ ] Monitor query performance after deployment
- [ ] Document in `docs/PARTICIPANT_SCORING.md`

---

## Related Files

**Using Scores**:
- `components/dashboard/attention-zones.tsx`
- `app/api/telegram/analytics/data/route.ts`
- `app/app/[org]/telegram/groups/[id]/page.tsx`
- `db/migrations/21_dashboard_helpers.sql`

**Score Functions**:
- `db/migrations/09_participant_scores.sql` - definitions
- `db/create_participants_functions.sql` - implementation

**Database**:
- `participants` table - `activity_score`, `risk_score` columns

---

## Testing

After implementation:

```sql
-- 1. Insert test participant
INSERT INTO participants (org_id, tg_user_id, full_name, last_activity_at)
VALUES ('org-uuid', 12345, 'Test User', NOW())
RETURNING id, activity_score, risk_score;

-- 2. Verify scores are calculated (not 0)
-- Expected: activity_score > 0, risk_score calculated

-- 3. Update activity
UPDATE participants 
SET last_activity_at = NOW() - INTERVAL '30 days'
WHERE tg_user_id = 12345
RETURNING id, activity_score, risk_score;

-- 4. Verify risk_score increased (older activity = higher risk)
```

---

**Priority**: Medium  
**Effort**: ~2-3 hours  
**Impact**: High (enables Dashboard, Analytics features)

