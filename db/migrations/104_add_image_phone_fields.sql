-- Migration 104: Add image_url and phone fields to existing app collections
-- Date: 2025-11-09

-- Update all collections to add image_url and phone fields if they don't exist
DO $$
DECLARE
  collection_record RECORD;
  collection_schema JSONB;
  updated_schema JSONB;
  has_image_url BOOLEAN;
  has_phone BOOLEAN;
BEGIN
  -- Loop through all collections
  FOR collection_record IN 
    SELECT id, schema 
    FROM app_collections
  LOOP
    collection_schema := collection_record.schema;
    
    -- Check if image_url field already exists
    has_image_url := EXISTS (
      SELECT 1 
      FROM jsonb_array_elements(collection_schema->'fields') AS field
      WHERE field->>'name' = 'image_url'
    );
    
    -- Check if phone field already exists
    has_phone := EXISTS (
      SELECT 1 
      FROM jsonb_array_elements(collection_schema->'fields') AS field
      WHERE field->>'name' = 'phone'
    );
    
    updated_schema := collection_schema;
    
    -- Add image_url field if it doesn't exist
    IF NOT has_image_url THEN
      updated_schema := jsonb_set(
        updated_schema,
        '{fields}',
        (updated_schema->'fields') || jsonb_build_array(
          jsonb_build_object(
            'name', 'image_url',
            'type', 'url',
            'label', 'Фото (ссылка)',
            'required', false
          )
        )
      );
      
      RAISE NOTICE 'Added image_url field to collection %', collection_record.id;
    END IF;
    
    -- Add phone field if it doesn't exist
    IF NOT has_phone THEN
      updated_schema := jsonb_set(
        updated_schema,
        '{fields}',
        (updated_schema->'fields') || jsonb_build_array(
          jsonb_build_object(
            'name', 'phone',
            'type', 'phone',
            'label', 'Телефон',
            'required', false
          )
        )
      );
      
      RAISE NOTICE 'Added phone field to collection %', collection_record.id;
    END IF;
    
    -- Update the collection if schema changed
    IF NOT has_image_url OR NOT has_phone THEN
      UPDATE app_collections
      SET schema = updated_schema,
          updated_at = NOW()
      WHERE id = collection_record.id;
      
      RAISE NOTICE 'Updated collection % schema', collection_record.id;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Migration completed successfully';
END $$;

-- Verify the changes
SELECT 
  ac.id,
  a.name as app_name,
  ac.name as collection_name,
  (
    SELECT COUNT(*)
    FROM jsonb_array_elements(ac.schema->'fields') AS field
    WHERE field->>'name' IN ('image_url', 'phone')
  ) as new_fields_count
FROM app_collections ac
JOIN apps a ON ac.app_id = a.id
ORDER BY a.created_at DESC;

