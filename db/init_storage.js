// Script for initializing Supabase Storage and setting up policies
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')

// Load environment variables
dotenv.config({ path: '.env.local' })

// Validate required environment variables
const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY'
]

for (const env of required) {
  if (!process.env[env]) {
    console.error(`Error: Missing environment variable ${env}`)
    process.exit(1)
  }
}

// Create Supabase admin client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false
    }
  }
)

// SQL file paths
const BUCKET_POLICIES_PATH = path.join(__dirname, 'bucket_policies.sql')

async function initStorage() {
  try {
    console.log('🔵 Starting storage initialization...')

    // 1. Create Storage bucket for materials
    console.log('🔵 Creating Storage bucket for materials...')
    const { error: bucketError } = await supabase.storage.createBucket('materials', {
      public: false,
      fileSizeLimit: 1024 * 1024 * 10, // 10MB
      allowedMimeTypes: [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/svg+xml',
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
        'text/plain',
        'text/csv',
        'application/zip',
      ]
    })

    if (bucketError && !bucketError.message.includes('already exists')) {
      console.error('Error creating bucket:', bucketError)
      process.exit(1)
    }
    console.log('✅ Storage bucket created or already exists')

    // 2. Apply bucket policies
    console.log('🔵 Applying Storage bucket policies...')
    const bucketPoliciesSql = fs.readFileSync(BUCKET_POLICIES_PATH, 'utf8')
    
    // Execute the SQL using Supabase's RPC function
    // Note: The exec_sql function must be created first in the database
    const { error: policiesError } = await supabase.rpc('exec_sql', { 
      sql: bucketPoliciesSql 
    })
    
    if (policiesError) {
      console.error('Error applying bucket policies:', policiesError)
      process.exit(1)
    }
    console.log('✅ Storage bucket policies applied successfully')

    console.log('✅ Storage initialization completed successfully')
    
  } catch (error) {
    console.error('Initialization failed:', error)
    process.exit(1)
  }
}

// Execute the initialization
initStorage()
  .then(() => console.log('🚀 Done!'))
  .catch(error => console.error('🔴 Fatal error:', error))
