import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'

/**
 * POST /api/whatsapp/import
 * Import WhatsApp chat history from exported .txt file
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    // Get orgId from query params
    const orgId = request.nextUrl.searchParams.get('orgId')
    if (!orgId) {
      return NextResponse.json({ error: 'orgId is required' }, { status: 400 })
    }
    
    console.log(`[WhatsApp Import] Starting import for org ${orgId}`)
    
    // Auth check
    const supabase = await createClientServer()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      console.error('[WhatsApp Import] Auth error:', authError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Check org membership
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .single()
    
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      console.error('[WhatsApp Import] User not admin:', user.id)
      return NextResponse.json({ error: 'Only admins can import' }, { status: 403 })
    }
    
    // Parse form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    
    console.log(`[WhatsApp Import] File received: ${file.name}, size: ${file.size} bytes`)
    
    // Extract group name from filename
    // Format: "Чат WhatsApp с контактом GROUP_NAME.txt" or "Чат WhatsApp с GROUP_NAME.txt"
    let groupName = 'WhatsApp'
    const fileNameMatch = file.name.match(/Чат WhatsApp с (?:контактом\s+)?(.+?)(?:-\d+)?\.txt$/i)
    if (fileNameMatch) {
      groupName = fileNameMatch[1].trim()
    }
    console.log(`[WhatsApp Import] Extracted group name: ${groupName}`)
    
    // Read file content
    const content = await file.text()
    const lines = content.split('\n').filter(line => line.trim())
    
    console.log(`[WhatsApp Import] Total lines: ${lines.length}`)
    
    // Parse messages
    // Format: DD.MM.YYYY, HH:MM - Имя/Телефон: Сообщение
    const messagePattern = /^(\d{1,2}\.\d{1,2}\.\d{4}),\s*(\d{1,2}:\d{2})\s*-\s*([^:]+):\s*(.*)$/
    
    const messages: Array<{
      date: string
      time: string
      sender: string
      text: string
      timestamp: Date
    }> = []
    
    const participantNames = new Map<string, { 
      phone: string | null
      name: string 
      messageCount: number
    }>()
    
    for (const line of lines) {
      const match = line.match(messagePattern)
      if (!match) continue
      
      const [, dateStr, timeStr, sender, text] = match
      const senderTrimmed = sender.trim()
      
      // Skip system messages
      const lowerSender = senderTrimmed.toLowerCase()
      if (
        lowerSender.includes('создал') ||
        lowerSender.includes('добавил') ||
        lowerSender.includes('изменил') ||
        lowerSender.includes('вышел') ||
        lowerSender.includes('вступил') ||
        lowerSender.includes('присоединил') ||
        lowerSender.includes('покинул') ||
        lowerSender.includes('удалил') ||
        senderTrimmed === 'Вы' ||
        senderTrimmed.length > 100
      ) {
        continue
      }
      
      // Parse date
      const [day, month, year] = dateStr.split('.')
      const [hours, minutes] = timeStr.split(':')
      const timestamp = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hours),
        parseInt(minutes)
      )
      
      // Check if sender is a phone number
      const phoneMatch = senderTrimmed.match(/^\+?\d[\d\s\-()]+$/)
      const isPhone = phoneMatch !== null
      const normalizedPhone = isPhone 
        ? senderTrimmed.replace(/[^\d+]/g, '') 
        : null
      
      // Track participant
      const participantKey = normalizedPhone || senderTrimmed
      if (!participantNames.has(participantKey)) {
        participantNames.set(participantKey, {
          phone: normalizedPhone,
          name: isPhone ? `WhatsApp ${senderTrimmed}` : senderTrimmed,
          messageCount: 0
        })
      }
      participantNames.get(participantKey)!.messageCount++
      
      messages.push({
        date: dateStr,
        time: timeStr,
        sender: participantKey,
        text: text.trim(),
        timestamp
      })
    }
    
    console.log(`[WhatsApp Import] Parsed ${messages.length} messages from ${participantNames.size} participants`)
    
    if (messages.length === 0) {
      return NextResponse.json({ 
        error: 'No messages found in file' 
      }, { status: 400 })
    }
    
    // Use admin client for database operations
    const adminSupabase = createAdminServer()
    
    // Create or find participants
    const participantIdMap = new Map<string, string>()
    let participantsCreated = 0
    let participantsExisting = 0
    
    for (const [key, info] of Array.from(participantNames.entries())) {
      let participantId: string | null = null
      
      // Try to find existing participant
      // Strategy:
      // 1. If phone number → search by normalized phone (last 10 digits)
      // 2. If name → search by exact name match
      // 3. Never match Telegram users by phone (they usually don't have phone in DB)
      
      if (info.phone) {
        // Search by normalized phone - take last 10 digits for comparison
        const normalizedPhone = info.phone.replace(/[^\d]/g, '')
        const last10Digits = normalizedPhone.slice(-10)
        
        // Search participants where phone contains these digits
        const { data: existingByPhone } = await adminSupabase
          .from('participants')
          .select('id, phone, full_name')
          .eq('org_id', orgId)
          .not('phone', 'is', null)
          .is('merged_into', null)
        
        // Manual filter for phone match (Supabase ilike can be tricky with formatted phones)
        const matchedByPhone = existingByPhone?.find(p => {
          if (!p.phone) return false
          const pNormalized = p.phone.replace(/[^\d]/g, '')
          return pNormalized.endsWith(last10Digits) || last10Digits.endsWith(pNormalized.slice(-10))
        })
        
        if (matchedByPhone) {
          participantId = matchedByPhone.id
          participantsExisting++
          console.log(`[WhatsApp Import] Found existing participant by phone: ${info.phone} → ${matchedByPhone.full_name || matchedByPhone.id}`)
        }
      } else {
        // Search by exact name match
        const { data: existingByName } = await adminSupabase
          .from('participants')
          .select('id')
          .eq('org_id', orgId)
          .eq('full_name', info.name)
          .is('merged_into', null)
          .limit(1)
          .maybeSingle()
        
        if (existingByName) {
          participantId = existingByName.id
          participantsExisting++
          console.log(`[WhatsApp Import] Found existing participant by name: ${info.name}`)
        }
      }
      
      // Create new participant if not found
      if (!participantId) {
        const { data: newParticipant, error: createError } = await adminSupabase
          .from('participants')
          .insert({
            org_id: orgId,
            full_name: info.name,
            phone: info.phone,
            source: 'whatsapp_import',
            custom_attributes: {
              whatsapp_imported: true,
              import_date: new Date().toISOString()
            }
          })
          .select('id')
          .single()
        
        if (createError) {
          console.error(`[WhatsApp Import] Error creating participant:`, createError)
          continue
        }
        
        participantId = newParticipant.id
        participantsCreated++
        console.log(`[WhatsApp Import] Created participant: ${info.name}`)
      }
      
      if (participantId) {
        participantIdMap.set(key, participantId)
      }
    }
    
    console.log(`[WhatsApp Import] Participants: ${participantsCreated} created, ${participantsExisting} existing`)
    
    // Import messages as activity_events
    let messagesImported = 0
    let messagesDuplicates = 0
    
    // Process in batches
    const BATCH_SIZE = 100
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE)
      
      const eventsToInsert = []
      
      for (const msg of batch) {
        const participantId = participantIdMap.get(msg.sender)
        if (!participantId) continue
        
        // Create message hash for deduplication
        const messageHash = `wa_${msg.timestamp.getTime()}_${msg.sender}_${msg.text.substring(0, 50)}`
        
        // Note: activity_events doesn't have participant_id column anymore (removed in migration 071)
        // We use tg_chat_id = 0 as marker for WhatsApp messages
        // And store participant_id in meta for later retrieval
        eventsToInsert.push({
          org_id: orgId,
          event_type: 'message',
          tg_user_id: null, // No Telegram user
          tg_chat_id: 0,    // Marker for WhatsApp (no real chat ID)
          chars_count: msg.text.length,
          meta: {
            text: msg.text,
            source: 'whatsapp',
            group_name: groupName, // Name of WhatsApp group
            participant_id: participantId, // Store participant link in meta
            original_sender: msg.sender,
            message_hash: messageHash
          },
          created_at: msg.timestamp.toISOString()
        })
      }
      
      if (eventsToInsert.length > 0) {
        // Insert messages - use simple insert, check duplicates by message_hash in meta
        const { error: insertError } = await adminSupabase
          .from('activity_events')
          .insert(eventsToInsert)
        
        if (insertError) {
          console.error(`[WhatsApp Import] Error inserting messages batch:`, insertError)
          // Check if it's a duplicate error
          if (insertError.code === '23505') {
            messagesDuplicates += eventsToInsert.length
          }
        } else {
          messagesImported += eventsToInsert.length
        }
      }
      
      console.log(`[WhatsApp Import] Processed batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(messages.length / BATCH_SIZE)}`)
    }
    
    const duration = Date.now() - startTime
    
    console.log(`[WhatsApp Import] Complete! ${messagesImported} messages imported in ${duration}ms`)
    
    return NextResponse.json({
      success: true,
      importId: `wa_${Date.now()}`,
      stats: {
        messagesTotal: messages.length,
        messagesImported,
        messagesDuplicates,
        participantsTotal: participantNames.size,
        participantsCreated,
        participantsExisting
      },
      duration
    })
    
  } catch (error) {
    console.error('[WhatsApp Import] Unexpected error:', error)
    return NextResponse.json({ 
      error: 'Import failed: ' + (error instanceof Error ? error.message : 'Unknown error')
    }, { status: 500 })
  }
}

