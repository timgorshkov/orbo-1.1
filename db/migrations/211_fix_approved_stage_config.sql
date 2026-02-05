-- ============================================
-- Fix: Ensure "Одобрено" stage has correct configuration for Telegram approval
-- ============================================

-- Update all "Одобрено" / "approved" stages to have correct configuration
UPDATE pipeline_stages
SET 
  is_terminal = true,
  terminal_type = 'success',
  auto_actions = jsonb_build_object('approve_telegram', true)
WHERE slug = 'approved'
  AND (is_terminal = false OR terminal_type IS NULL OR terminal_type != 'success' OR auto_actions IS NULL OR auto_actions = '{}'::jsonb);

-- Update all "Отклонено" / "rejected" stages to have correct configuration
UPDATE pipeline_stages
SET 
  is_terminal = true,
  terminal_type = 'failure',
  auto_actions = jsonb_build_object('reject_telegram', true)
WHERE slug = 'rejected'
  AND (is_terminal = false OR terminal_type IS NULL OR terminal_type != 'failure' OR auto_actions IS NULL OR auto_actions = '{}'::jsonb);

-- Log the changes
SELECT 
  'Fixed stages' as result,
  COUNT(*) as updated_count
FROM pipeline_stages
WHERE slug IN ('approved', 'rejected')
  AND is_terminal = true;
