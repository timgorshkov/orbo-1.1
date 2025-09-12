// Script for initializing the database schema in Supabase
// Imports
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
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// SQL file paths
const DEPLOY_SQL_PATH = path.join(__dirname, 'deploy.sql')
const BUCKET_POLICIES_PATH = path.join(__dirname, 'bucket_policies.sql')
const DEMO_DATA_PATH = path.join(__dirname, 'demo_data.sql')

async function initDatabase() {
  try {
    console.log('🔵 Starting database initialization...')

    // 1. Read and execute the main schema SQL
    console.log('🔵 Creating database schema...')
    const schemaSql = fs.readFileSync(DEPLOY_SQL_PATH, 'utf8')
    const { error: schemaError } = await supabase.rpc('exec_sql', { sql: schemaSql })
    
    if (schemaError) {
      console.error('Error creating schema:', schemaError)
      process.exit(1)
    }
    console.log('✅ Database schema created successfully')

    // 2. Create Storage bucket for materials
    console.log('🔵 Creating Storage bucket for materials...')
    const { error: bucketError } = await supabase.storage.createBucket('materials', {
      public: false,
      fileSizeLimit: 1024 * 1024 * 10, // 10MB
    })

    if (bucketError && !bucketError.message.includes('already exists')) {
      console.error('Error creating bucket:', bucketError)
      process.exit(1)
    }
    console.log('✅ Storage bucket created or already exists')

    // 3. Apply bucket policies
    console.log('🔵 Applying Storage bucket policies...')
    const bucketPoliciesSql = fs.readFileSync(BUCKET_POLICIES_PATH, 'utf8')
    const { error: policiesError } = await supabase.rpc('exec_sql', { sql: bucketPoliciesSql })
    
    if (policiesError) {
      console.error('Error applying bucket policies:', policiesError)
      process.exit(1)
    }
    console.log('✅ Storage bucket policies applied successfully')

    // 4. Ask if demo data should be loaded
    const loadDemo = process.argv.includes('--with-demo')
    
    if (loadDemo) {
      console.log('🔵 Loading demo data...')
      
      // Get current user ID for demo data
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      
      if (userError) {
        console.error('Error getting current user:', userError)
        process.exit(1)
      }

      // Read demo data SQL and replace placeholders
      let demoSql = fs.readFileSync(DEMO_DATA_PATH, 'utf8')
      demoSql = demoSql.replace(/YOUR_USER_ID_HERE/g, user.id)
      
      // Execute demo data SQL
      const { error: demoError } = await supabase.rpc('exec_sql', { sql: demoSql })
      
      if (demoError) {
        console.error('Error loading demo data:', demoError)
        process.exit(1)
      }
      console.log('✅ Demo data loaded successfully')
    }

    console.log('✅ Database initialization completed successfully')
    
  } catch (error) {
    console.error('Initialization failed:', error)
    process.exit(1)
  }
}

// Execute the initialization
initDatabase()
  .then(() => console.log('🚀 Done!'))
  .catch(error => console.error('🔴 Fatal error:', error))
