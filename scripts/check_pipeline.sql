SELECT id, name, telegram_group_id, pipeline_type, is_active 
FROM application_pipelines 
ORDER BY created_at DESC 
LIMIT 5;
