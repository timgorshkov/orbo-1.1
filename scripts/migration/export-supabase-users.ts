/**
 * Export users from Supabase Auth to PostgreSQL
 * 
 * Usage:
 * npx tsx scripts/migration/export-supabase-users.ts
 * 
 * This script:
 * 1. Fetches all users from Supabase Auth via admin API
 * 2. Exports them as INSERT statements for the new users table
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// Load env from .env file
import * as dotenv from 'dotenv'
dotenv.config()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function exportUsers() {
  console.log('Fetching users from Supabase Auth...')
  
  const allUsers: any[] = []
  let page = 1
  const perPage = 1000
  
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage
    })
    
    if (error) {
      console.error('Error fetching users:', error.message)
      break
    }
    
    if (!data.users || data.users.length === 0) {
      break
    }
    
    allUsers.push(...data.users)
    console.log(`Fetched page ${page}: ${data.users.length} users (total: ${allUsers.length})`)
    
    if (data.users.length < perPage) {
      break
    }
    
    page++
  }
  
  console.log(`\nTotal users: ${allUsers.length}`)
  
  // Generate SQL INSERT statements
  const sqlLines: string[] = [
    '-- Supabase Auth users export',
    `-- Generated: ${new Date().toISOString()}`,
    `-- Total users: ${allUsers.length}`,
    '',
    '-- Insert users into new users table',
    'INSERT INTO users (id, name, email, email_verified, image, tg_user_id, created_at, updated_at)',
    'VALUES'
  ]
  
  const valueLines: string[] = []
  
  for (const user of allUsers) {
    const id = user.id
    const email = user.email || null
    const name = user.user_metadata?.full_name || user.user_metadata?.name || null
    const emailVerified = user.email_confirmed_at || null
    const image = user.user_metadata?.avatar_url || null
    const tgUserId = user.user_metadata?.tg_user_id || user.raw_user_meta_data?.tg_user_id || null
    const createdAt = user.created_at
    const updatedAt = user.updated_at || user.created_at
    
    // Escape single quotes
    const escapeSql = (val: any) => {
      if (val === null || val === undefined) return 'NULL'
      return `'${String(val).replace(/'/g, "''")}'`
    }
    
    valueLines.push(
      `  (${escapeSql(id)}, ${escapeSql(name)}, ${escapeSql(email)}, ` +
      `${emailVerified ? `'${emailVerified}'` : 'NULL'}, ${escapeSql(image)}, ` +
      `${tgUserId ? tgUserId : 'NULL'}, '${createdAt}', '${updatedAt}')`
    )
  }
  
  sqlLines.push(valueLines.join(',\n'))
  sqlLines.push('ON CONFLICT (id) DO UPDATE SET')
  sqlLines.push('  name = COALESCE(EXCLUDED.name, users.name),')
  sqlLines.push('  email = COALESCE(EXCLUDED.email, users.email),')
  sqlLines.push('  email_verified = COALESCE(EXCLUDED.email_verified, users.email_verified),')
  sqlLines.push('  image = COALESCE(EXCLUDED.image, users.image),')
  sqlLines.push('  tg_user_id = COALESCE(EXCLUDED.tg_user_id, users.tg_user_id),')
  sqlLines.push('  updated_at = NOW();')
  sqlLines.push('')
  sqlLines.push(`-- Successfully exported ${allUsers.length} users`)
  
  // Write to file
  const outputPath = path.join(__dirname, 'supabase-users-export.sql')
  fs.writeFileSync(outputPath, sqlLines.join('\n'))
  console.log(`\nExported to: ${outputPath}`)
  
  // Also create a JSON export for debugging
  const jsonPath = path.join(__dirname, 'supabase-users-export.json')
  fs.writeFileSync(jsonPath, JSON.stringify(allUsers, null, 2))
  console.log(`JSON export: ${jsonPath}`)
  
  // Print summary
  console.log('\n=== Summary ===')
  console.log(`Total users: ${allUsers.length}`)
  console.log(`With email: ${allUsers.filter(u => u.email).length}`)
  console.log(`Email verified: ${allUsers.filter(u => u.email_confirmed_at).length}`)
  console.log(`With tg_user_id: ${allUsers.filter(u => u.user_metadata?.tg_user_id).length}`)
  
  // Print auth providers
  const providers: Record<string, number> = {}
  for (const user of allUsers) {
    const provider = user.app_metadata?.provider || 'email'
    providers[provider] = (providers[provider] || 0) + 1
  }
  console.log('\nAuth providers:')
  for (const [provider, count] of Object.entries(providers)) {
    console.log(`  ${provider}: ${count}`)
  }
}

exportUsers().catch(console.error)

