#!/usr/bin/env node

/**
 * Script to create app-files Storage bucket in Supabase
 * Run: node db/create_app_files_bucket.js
 */

const { createClient } = require('@supabase/supabase-js')
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
    console.error(`❌ Error: Missing environment variable ${env}`)
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

async function createAppFilesBucket() {
  try {
    console.log('🔵 Creating app-files Storage bucket...')

    // Create bucket
    const { data, error: bucketError } = await supabase.storage.createBucket('app-files', {
      public: true, // Public read access
      fileSizeLimit: 10 * 1024 * 1024, // 10MB
      allowedMimeTypes: [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/svg+xml',
        'video/mp4',
        'video/quicktime',
        'application/pdf'
      ]
    })

    if (bucketError) {
      if (bucketError.message.includes('already exists')) {
        console.log('✅ Bucket app-files already exists')
      } else {
        console.error('❌ Error creating bucket:', bucketError)
        process.exit(1)
      }
    } else {
      console.log('✅ Bucket app-files created successfully')
    }

    console.log('✅ Storage bucket setup complete!')
    console.log('')
    console.log('📝 Next steps:')
    console.log('1. Run the SQL migration: db/migrations/108_create_app_files_bucket.sql')
    console.log('   (To set up RLS policies)')
    console.log('2. Test uploading a logo in the app')

  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

// Run the script
createAppFilesBucket()

