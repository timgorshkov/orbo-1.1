import { NextRequest, NextResponse } from 'next/server'
import { createClientServer, createAdminServer } from '@/lib/server/supabaseServer'
import { logErrorToDatabase } from '@/lib/logErrorToDatabase'
import { logAdminAction, AdminActions, ResourceTypes } from '@/lib/logAdminAction'
import JSZip from 'jszip'

/**
 * Parse VCF file content to extract contact name and phone
 * VCF formats:
 * TEL;type=CELL:+7 999 123-45-67
 * TEL;waid=79199678388:+7 919 967-83-88
 * TEL:+7 999 123-45-67
 */
function parseVCF(content: string): { name: string; phone: string } | null {
  const lines = content.split('\n').map(l => l.trim())
  
  let name = ''
  let phone = ''
  
  for (const line of lines) {
    // Full name
    if (line.startsWith('FN:')) {
      name = line.substring(3).trim()
    }
    // Phone number - handle multiple formats
    // TEL;waid=79199678388:+7 919 967-83-88
    // TEL;type=CELL:+7 999 123-45-67
    // TEL:+7 999 123-45-67
    if (line.startsWith('TEL')) {
      // Find the actual phone number (after last colon, usually starts with +)
      const parts = line.split(':')
      // Get the last part which should be the actual phone
      const phonePart = parts[parts.length - 1].trim()
      if (phonePart) {
        phone = phonePart
      }
    }
  }
  
  if (phone) {
    // Normalize phone - remove everything except digits
    const normalized = phone.replace(/[^\d]/g, '')
    return { name: name || phone, phone: normalized }
  }
  
  return null
}

/**
 * POST /api/whatsapp/import
 * Import WhatsApp chat history from exported .txt file or .zip archive
 * 
 * Supports:
 * - .txt file (chat export)
 * - .zip archive (contains .txt + .vcf files for contacts)
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
    
    console.log(`[WhatsApp Import] File received: ${file.name}, size: ${file.size} bytes, type: ${file.type}`)
    
    let chatContent = ''
    let groupName = 'WhatsApp'
    const vcfContacts = new Map<string, string>() // phone -> name from VCF
    const originalFileName = file.name
    
    // Handle ZIP or TXT file
    if (file.name.toLowerCase().endsWith('.zip') || file.type === 'application/zip') {
      console.log('[WhatsApp Import] Processing ZIP archive...')
      
      const arrayBuffer = await file.arrayBuffer()
      const zip = await JSZip.loadAsync(arrayBuffer)
      
      // Find .txt and .vcf files
      const files = Object.keys(zip.files)
      console.log(`[WhatsApp Import] ZIP contains ${files.length} files:`, files.slice(0, 10))
      
      for (const fileName of files) {
        const zipFile = zip.files[fileName]
        if (zipFile.dir) continue
        
        const lowerName = fileName.toLowerCase()
        
        // Chat history file
        if (lowerName.endsWith('.txt') && !lowerName.startsWith('__macosx')) {
          chatContent = await zipFile.async('string')
          console.log(`[WhatsApp Import] Found chat file: ${fileName} (${chatContent.length} chars)`)
          
          // Extract group name from txt filename
          // Handle: "Чат WhatsApp с контактом GROUP_NAME.txt" or "Чат WhatsApp с GROUP_NAME.txt"
          // Also handle copy suffix like "-1.txt"
          let extractedName = fileName
            .replace(/\.txt$/i, '')           // Remove .txt
            .replace(/-\d+$/, '')             // Remove copy suffix like -1
            .replace(/^Чат WhatsApp с\s*/i, '') // Remove "Чат WhatsApp с "
            .replace(/^контактом\s*/i, '')    // Remove "контактом "
            .trim()
          
          if (extractedName && extractedName.length > 0) {
            groupName = extractedName
          }
          console.log(`[WhatsApp Import] Extracted group name: ${groupName}`)
        }
        
        // VCF contact file
        if (lowerName.endsWith('.vcf') && !lowerName.startsWith('__macosx')) {
          try {
            const vcfContent = await zipFile.async('string')
            const contact = parseVCF(vcfContent)
            if (contact && contact.phone) {
              // Normalize phone for matching (last 10 digits)
              const last10 = contact.phone.slice(-10)
              vcfContacts.set(last10, contact.name)
              console.log(`[WhatsApp Import] VCF: ${contact.phone} (key: ${last10}) → ${contact.name}`)
            }
          } catch (e) {
            console.warn(`[WhatsApp Import] Failed to parse VCF ${fileName}:`, e)
          }
        }
      }
      
      if (!chatContent) {
        await logErrorToDatabase({
          level: 'warn',
          message: 'No chat .txt file found in WhatsApp archive',
          errorCode: 'WHATSAPP_IMPORT_PARSE_ERROR',
          context: {
            endpoint: '/api/whatsapp/import',
            reason: 'no_txt_in_archive',
            fileName: file.name,
            fileSize: file.size
          },
          userId: user.id,
          orgId
        })
        return NextResponse.json({ error: 'No chat .txt file found in archive' }, { status: 400 })
      }
      
      console.log(`[WhatsApp Import] Loaded ${vcfContacts.size} contacts from VCF files`)
      
    } else if (file.name.toLowerCase().endsWith('.txt')) {
      // Direct TXT file
      chatContent = await file.text()
      
      // Extract group name from filename
      let extractedName = file.name
        .replace(/\.txt$/i, '')
        .replace(/-\d+$/, '')
        .replace(/^Чат WhatsApp с\s*/i, '')
        .replace(/^контактом\s*/i, '')
        .trim()
      
      if (extractedName && extractedName.length > 0) {
        groupName = extractedName
      }
      console.log(`[WhatsApp Import] Extracted group name: ${groupName}`)
    } else {
      return NextResponse.json({ 
        error: 'Unsupported file format. Please upload .txt or .zip file' 
      }, { status: 400 })
    }
    
    console.log(`[WhatsApp Import] Group name: ${groupName}`)
    
    // Remove BOM (Byte Order Mark) if present
    if (chatContent.charCodeAt(0) === 0xFEFF) {
      chatContent = chatContent.slice(1)
      console.log(`[WhatsApp Import] Removed BOM from content`)
    }
    
    // Normalize line endings (handle Windows CRLF, Mac CR, Unix LF)
    chatContent = chatContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    
    const lines = chatContent.split('\n').filter(line => line.trim())
    console.log(`[WhatsApp Import] Total lines: ${lines.length}`)
    
    // Log first few lines for debugging
    if (lines.length > 0) {
      console.log(`[WhatsApp Import] First 3 lines:`)
      lines.slice(0, 3).forEach((line, i) => {
        console.log(`  Line ${i + 1}: "${line.substring(0, 150)}${line.length > 150 ? '...' : ''}"`)
      })
    }
    
    // Parse messages - support multiple formats
    // Format 1: DD.MM.YYYY, HH:MM - Имя/Телефон: Сообщение (Russian mobile)
    // Format 2: [DD.MM.YYYY, HH:MM:SS] Имя/Телефон: Сообщение (iOS/some Android)
    // Format 3: DD/MM/YYYY, HH:MM - Имя/Телефон: Сообщение (US/English)
    // Format 4: DD.MM.YY, HH:MM - Имя/Телефон: Сообщение (short year)
    const messagePatterns = [
      // Format 1: DD.MM.YYYY, HH:MM - Name: Message
      /^(\d{1,2}\.\d{1,2}\.\d{4}),\s*(\d{1,2}:\d{2})\s*-\s*([^:]+):\s*(.*)$/,
      // Format 2: [DD.MM.YYYY, HH:MM:SS] Name: Message (with brackets)
      /^\[(\d{1,2}\.\d{1,2}\.\d{4}),\s*(\d{1,2}:\d{2})(?::\d{2})?\]\s*([^:]+):\s*(.*)$/,
      // Format 3: DD/MM/YYYY, HH:MM - Name: Message (slash dates)
      /^(\d{1,2}\/\d{1,2}\/\d{4}),\s*(\d{1,2}:\d{2})\s*-\s*([^:]+):\s*(.*)$/,
      // Format 4: DD.MM.YY, HH:MM - Name: Message (short year)
      /^(\d{1,2}\.\d{1,2}\.\d{2}),\s*(\d{1,2}:\d{2})\s*-\s*([^:]+):\s*(.*)$/,
      // Format 5: [DD/MM/YYYY, HH:MM:SS] Name: Message (brackets + slash)
      /^\[(\d{1,2}\/\d{1,2}\/\d{4}),\s*(\d{1,2}:\d{2})(?::\d{2})?\]\s*([^:]+):\s*(.*)$/,
    ]
    
    // Detect which pattern works
    let workingPattern: RegExp | null = null
    for (const pattern of messagePatterns) {
      const testMatches = lines.filter(line => pattern.test(line)).length
      if (testMatches > 0) {
        workingPattern = pattern
        console.log(`[WhatsApp Import] Pattern matched: ${testMatches} lines with pattern ${messagePatterns.indexOf(pattern) + 1}`)
        break
      }
    }
    
    if (!workingPattern) {
      console.error(`[WhatsApp Import] No pattern matched any lines. Sample lines:`)
      lines.slice(0, 5).forEach((line, i) => {
        console.error(`  Line ${i + 1}: "${line}"`)
      })
      return NextResponse.json({ 
        error: 'Неподдерживаемый формат файла. Попробуйте экспортировать чат заново через WhatsApp.',
        details: `First line: ${lines[0]?.substring(0, 100) || 'empty'}`
      }, { status: 400 })
    }
    
    const messagePattern = workingPattern
    
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
      firstMessageDate: Date | null
      lastMessageDate: Date | null
    }>()
    
    let minDate: Date | null = null
    let maxDate: Date | null = null
    
    let skippedNoMatch = 0
    let skippedSystem = 0
    
    for (const line of lines) {
      const match = line.match(messagePattern)
      if (!match) {
        skippedNoMatch++
        continue
      }
      
      const [, dateStr, timeStr, sender, text] = match
      const senderTrimmed = sender.trim()
      
      // Skip system messages
      const lowerSender = senderTrimmed.toLowerCase()
      const lowerText = text.toLowerCase()
      
      // WhatsApp system message patterns
      const isSystemMessage = 
        lowerSender.includes('создал') ||
        lowerSender.includes('добавил') ||
        lowerSender.includes('изменил') ||
        lowerSender.includes('вышел') ||
        lowerSender.includes('вступил') ||
        lowerSender.includes('присоединил') ||
        lowerSender.includes('покинул') ||
        lowerSender.includes('удалил') ||
        lowerText.includes('создал эту группу') ||
        lowerText.includes('добавлен в группу') ||
        lowerText.includes('покинул группу') ||
        lowerText.includes('присоединился') ||
        lowerText.includes('изменил название') ||
        lowerText.includes('изменил значок') ||
        lowerText.includes('сообщения защищены') ||
        lowerText.includes('end-to-end') ||
        lowerText.includes('шифрованием') ||
        senderTrimmed === 'Вы' ||
        senderTrimmed.length > 100
      
      if (isSystemMessage) {
        skippedSystem++
        continue
      }
      
      // Parse date - support both dot and slash separators, and 2-digit years
      const dateParts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('.')
      let [day, month, year] = dateParts
      
      // Handle 2-digit year (e.g., "24" → "2024")
      if (year && year.length === 2) {
        const yearNum = parseInt(year)
        year = (yearNum > 50 ? '19' : '20') + year
      }
      
      const [hours, minutes] = timeStr.split(':')
      const timestamp = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hours),
        parseInt(minutes)
      )
      
      // Track date range
      if (!minDate || timestamp < minDate) minDate = timestamp
      if (!maxDate || timestamp > maxDate) maxDate = timestamp
      
      // Check if sender is a phone number
      const phoneMatch = senderTrimmed.match(/^\+?\d[\d\s\-()]+$/)
      const isPhone = phoneMatch !== null
      const normalizedPhone = isPhone 
        ? senderTrimmed.replace(/[^\d+]/g, '') 
        : null
      
      // Get name from VCF if available
      let displayName = isPhone ? `WhatsApp ${senderTrimmed}` : senderTrimmed
      if (normalizedPhone) {
        // Extract last 10 digits for matching with VCF
        const digitsOnly = normalizedPhone.replace(/[^\d]/g, '')
        const last10 = digitsOnly.slice(-10)
        const vcfName = vcfContacts.get(last10)
        if (vcfName) {
          displayName = vcfName
          console.log(`[WhatsApp Import] VCF match: ${senderTrimmed} (key: ${last10}) → ${vcfName}`)
        }
      }
      
      // Track participant
      const participantKey = normalizedPhone || senderTrimmed
      if (!participantNames.has(participantKey)) {
        participantNames.set(participantKey, {
          phone: normalizedPhone,
          name: displayName,
          messageCount: 0,
          firstMessageDate: timestamp,
          lastMessageDate: timestamp
        })
      }
      const participantInfo = participantNames.get(participantKey)!
      participantInfo.messageCount++
      // Track first and last message dates
      if (!participantInfo.firstMessageDate || timestamp < participantInfo.firstMessageDate) {
        participantInfo.firstMessageDate = timestamp
      }
      if (!participantInfo.lastMessageDate || timestamp > participantInfo.lastMessageDate) {
        participantInfo.lastMessageDate = timestamp
      }
      
      messages.push({
        date: dateStr,
        time: timeStr,
        sender: participantKey,
        text: text.trim(),
        timestamp
      })
    }
    
    console.log(`[WhatsApp Import] Parsed ${messages.length} messages from ${participantNames.size} participants`)
    console.log(`[WhatsApp Import] Skipped: ${skippedNoMatch} no match, ${skippedSystem} system messages`)
    
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
        
        // Manual filter for phone match
        const matchedByPhone = existingByPhone?.find(p => {
          if (!p.phone) return false
          const pNormalized = p.phone.replace(/[^\d]/g, '')
          return pNormalized.endsWith(last10Digits) || last10Digits.endsWith(pNormalized.slice(-10))
        })
        
        if (matchedByPhone) {
          participantId = matchedByPhone.id
          participantsExisting++
          
          // Update name from VCF if participant has generic name
          if (info.name && !info.name.startsWith('WhatsApp') && 
              matchedByPhone.full_name?.startsWith('WhatsApp')) {
            await adminSupabase
              .from('participants')
              .update({ full_name: info.name })
              .eq('id', matchedByPhone.id)
            console.log(`[WhatsApp Import] Updated name from VCF: ${matchedByPhone.full_name} → ${info.name}`)
          }
          
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
        
        // Update last_activity_at and activity_score for the participant
        // This ensures correct engagement category calculation
        if (info.lastMessageDate) {
          const updateData: Record<string, any> = {
            last_activity_at: info.lastMessageDate.toISOString()
          }
          
          // Calculate simple activity_score based on message count (0-100 scale)
          // Score = min(100, messageCount * 2)
          const activityScore = Math.min(100, info.messageCount * 2)
          updateData.activity_score = activityScore
          
          const { error: updateError } = await adminSupabase
            .from('participants')
            .update(updateData)
            .eq('id', participantId)
          
          if (updateError) {
            console.warn(`[WhatsApp Import] Failed to update participant activity: ${updateError.message}`)
          }
        }
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
        
        eventsToInsert.push({
          org_id: orgId,
          event_type: 'message',
          tg_user_id: null,
          tg_chat_id: 0,
          chars_count: msg.text.length,
          meta: {
            text: msg.text,
            source: 'whatsapp',
            group_name: groupName,
            participant_id: participantId,
            original_sender: msg.sender,
            message_hash: messageHash
          },
          created_at: msg.timestamp.toISOString()
        })
      }
      
      if (eventsToInsert.length > 0) {
        const { error: insertError } = await adminSupabase
          .from('activity_events')
          .insert(eventsToInsert)
        
        if (insertError) {
          console.error(`[WhatsApp Import] Error inserting messages batch:`, insertError)
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
    
    // Save import history
    const { data: importRecord, error: importError } = await adminSupabase
      .from('whatsapp_imports')
      .insert({
        org_id: orgId,
        created_by: user.id,
        file_name: originalFileName,
        group_name: groupName,
        import_status: 'completed',
        messages_total: messages.length,
        messages_imported: messagesImported,
        messages_duplicates: messagesDuplicates,
        participants_total: participantNames.size,
        participants_created: participantsCreated,
        participants_existing: participantsExisting,
        date_range_start: minDate?.toISOString(),
        date_range_end: maxDate?.toISOString()
      })
      .select('id')
      .single()
    
    if (importError) {
      console.warn('[WhatsApp Import] Failed to save import history:', importError)
    } else {
      console.log(`[WhatsApp Import] Saved import record: ${importRecord?.id}`)
    }
    
    console.log(`[WhatsApp Import] Complete! ${messagesImported} messages imported in ${duration}ms`)
    
    // Log admin action
    await logAdminAction({
      orgId,
      userId: user.id,
      action: AdminActions.IMPORT_WHATSAPP_HISTORY,
      resourceType: ResourceTypes.IMPORT,
      resourceId: importRecord?.id?.toString() || `wa_${Date.now()}`,
      metadata: {
        group_name: groupName,
        filename: originalFileName,
        messages_imported: messagesImported,
        participants_created: participantsCreated,
        duration_ms: duration
      }
    })
    
    return NextResponse.json({
      success: true,
      importId: importRecord?.id || `wa_${Date.now()}`,
      stats: {
        messagesTotal: messages.length,
        messagesImported,
        messagesDuplicates,
        participantsTotal: participantNames.size,
        participantsCreated,
        participantsExisting,
        vcfContactsFound: vcfContacts.size
      },
      groupName,
      duration
    })
    
  } catch (error) {
    await logErrorToDatabase({
      level: 'error',
      message: error instanceof Error ? error.message : 'Unknown error in WhatsApp import',
      errorCode: 'WHATSAPP_IMPORT_ERROR',
      context: {
        endpoint: '/api/whatsapp/import',
        errorType: error instanceof Error ? error.constructor.name : typeof error
      },
      stackTrace: error instanceof Error ? error.stack : undefined
    })
    return NextResponse.json({ 
      error: 'Import failed: ' + (error instanceof Error ? error.message : 'Unknown error')
    }, { status: 500 })
  }
}
