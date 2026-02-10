'use client'

import { useState, useMemo } from 'react'
import ParticipantProfileCard from './participant-profile-card'
import ParticipantActivityTimeline from './participant-activity-timeline'
import ParticipantDuplicatesCard from './participant-duplicates-card'
import ParticipantEventsCard from './participant-events-card'
import type { ParticipantDetailResult } from '@/lib/types/participant'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useAdminMode } from '@/lib/hooks/useAdminMode'

interface ParticipantDetailTabsProps {
  orgId: string
  initialDetail: ParticipantDetailResult
  isAdmin: boolean
  canEdit: boolean
  currentUserId: string
  userRole?: 'owner' | 'admin' | 'member' | 'guest'
}

export default function ParticipantDetailTabs({ 
  orgId, 
  initialDetail, 
  isAdmin, 
  canEdit,
  currentUserId,
  userRole
}: ParticipantDetailTabsProps) {
  const [detail, setDetail] = useState<ParticipantDetailResult>(initialDetail)
  
  // Respect admin mode toggle - when admin switches to "participant mode",
  // show the profile as a regular participant would see it
  const { adminMode } = useAdminMode(userRole || (isAdmin ? 'admin' : 'member'))
  const effectiveAdmin = isAdmin && adminMode
  const effectiveCanEdit = effectiveAdmin ? canEdit : (canEdit && !isAdmin)

  const editableDetail = useMemo(() => detail, [detail])

  const handleDetailUpdate = (nextDetail?: ParticipantDetailResult) => {
    if (nextDetail) {
      setDetail(nextDetail)
    }
  }

  const eventRegistrationCount = editableDetail.eventRegistrations?.length || 0

  return (
    <Tabs defaultValue="profile" className="space-y-6">
      <TabsList>
        <TabsTrigger value="profile">Профиль</TabsTrigger>
        {effectiveAdmin && (
          <TabsTrigger value="events">
            События{eventRegistrationCount > 0 ? ` (${eventRegistrationCount})` : ''}
          </TabsTrigger>
        )}
        {effectiveAdmin && <TabsTrigger value="activity">Активность</TabsTrigger>}
        {effectiveAdmin && <TabsTrigger value="duplicates">Дубликаты</TabsTrigger>}
      </TabsList>

      <TabsContent value="profile" className="space-y-6">
        <ParticipantProfileCard 
          orgId={orgId} 
          detail={editableDetail} 
          onDetailUpdate={handleDetailUpdate}
          canEdit={effectiveCanEdit}
          isAdmin={effectiveAdmin}
        />
      </TabsContent>

      {effectiveAdmin && (
        <TabsContent value="events">
          <ParticipantEventsCard orgId={orgId} detail={editableDetail} />
        </TabsContent>
      )}

      {effectiveAdmin && (
        <TabsContent value="activity">
          <ParticipantActivityTimeline detail={editableDetail} />
        </TabsContent>
      )}

      {effectiveAdmin && (
        <TabsContent value="duplicates">
          <ParticipantDuplicatesCard 
            orgId={orgId} 
            detail={editableDetail} 
            onDetailUpdate={handleDetailUpdate} 
          />
        </TabsContent>
      )}
    </Tabs>
  )
}
