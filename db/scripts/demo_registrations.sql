-- Demo registrations for event b6fa8743-e305-4105-b4da-7dc3e69daf06
-- Organization: a3e8bc8f-8171-472c-a955-2f7878aed6f1
-- Creates 15 registrations from WhatsApp-named participants, spread over 14 days
-- Run: docker exec -i orbo_postgres psql -U orbo -d orbo < db/scripts/demo_registrations.sql

-- Step 1: Check how many WhatsApp participants exist
DO $$
DECLARE
  wp_count INT;
BEGIN
  SELECT count(*) INTO wp_count 
  FROM participants 
  WHERE org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1' 
    AND full_name LIKE 'WhatsApp%'
    AND merged_into IS NULL
    AND status = 'active';
  RAISE NOTICE 'Found % WhatsApp participants', wp_count;
END $$;

-- Step 2: Insert 15 registrations with natural distribution
-- Days spread: -14, -13, -12, -11, -9, -8, -7, -6, -5, -4, -3, -2, -1, -1, 0
-- (some days have 2, some days are skipped)
WITH whatsapp_participants AS (
  SELECT id, full_name, ROW_NUMBER() OVER (ORDER BY created_at) as rn
  FROM participants 
  WHERE org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1' 
    AND full_name LIKE 'WhatsApp%'
    AND merged_into IS NULL
    AND status = 'active'
    AND id NOT IN (
      SELECT participant_id FROM event_registrations 
      WHERE event_id = 'b6fa8743-e305-4105-b4da-7dc3e69daf06'
    )
  LIMIT 15
),
registration_schedule(slot, days_ago, hour, minute) AS (
  VALUES
    (1,  13, 9,  14),
    (2,  12, 14, 37),
    (3,  11, 11, 02),
    (4,  11, 18, 45),
    (5,  9,  10, 21),
    (6,  8,  16, 08),
    (7,  8,  20, 33),
    (8,  7,  12, 55),
    (9,  5,  9,  47),
    (10, 5,  15, 19),
    (11, 4,  17, 42),
    (12, 3,  11, 28),
    (13, 2,  13, 06),
    (14, 1,  10, 51),
    (15, 1,  19, 22)
)
INSERT INTO event_registrations (
  id,
  event_id,
  participant_id,
  registered_at,
  created_at,
  registration_source,
  status,
  registration_data,
  quantity,
  price,
  payment_status,
  qr_token
)
SELECT 
  gen_random_uuid(),
  'b6fa8743-e305-4105-b4da-7dc3e69daf06',
  wp.id,
  (CURRENT_DATE - (s.days_ago || ' days')::interval + (s.hour || ' hours')::interval + (s.minute || ' minutes')::interval)::timestamptz,
  (CURRENT_DATE - (s.days_ago || ' days')::interval + (s.hour || ' hours')::interval + (s.minute || ' minutes')::interval)::timestamptz,
  CASE 
    WHEN s.slot % 3 = 0 THEN 'telegram_miniapp'
    WHEN s.slot % 3 = 1 THEN 'web'
    ELSE 'telegram'
  END,
  'registered',
  jsonb_build_object('full_name', wp.full_name),
  1,
  500.00,
  CASE
    WHEN s.slot <= 10 THEN 'paid'
    WHEN s.slot <= 13 THEN 'pending'
    ELSE 'pending'
  END,
  gen_random_uuid()::text
FROM whatsapp_participants wp
JOIN registration_schedule s ON s.slot = wp.rn
ORDER BY s.days_ago DESC;

-- Step 3: Set paid_at for paid registrations
UPDATE event_registrations 
SET paid_at = registered_at + interval '1 hour' * (1 + floor(random() * 12)::int),
    paid_amount = 500.00
WHERE event_id = 'b6fa8743-e305-4105-b4da-7dc3e69daf06'
  AND payment_status = 'paid'
  AND paid_at IS NULL
  AND participant_id IN (
    SELECT id FROM participants 
    WHERE full_name LIKE 'WhatsApp%' 
      AND org_id = 'a3e8bc8f-8171-472c-a955-2f7878aed6f1'
  );

-- Step 4: Verify results
SELECT 
  er.registered_at::date as reg_date,
  count(*) as registrations,
  string_agg(p.full_name, ', ' ORDER BY er.registered_at) as participants,
  string_agg(er.payment_status, ', ' ORDER BY er.registered_at) as payment_statuses
FROM event_registrations er
JOIN participants p ON p.id = er.participant_id
WHERE er.event_id = 'b6fa8743-e305-4105-b4da-7dc3e69daf06'
  AND p.full_name LIKE 'WhatsApp%'
GROUP BY er.registered_at::date
ORDER BY reg_date;

SELECT count(*) as total_new_registrations
FROM event_registrations er
JOIN participants p ON p.id = er.participant_id
WHERE er.event_id = 'b6fa8743-e305-4105-b4da-7dc3e69daf06'
  AND p.full_name LIKE 'WhatsApp%';
