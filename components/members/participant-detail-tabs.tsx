'use client'

import { useState, useMemo } from 'react'
import ParticipantProfileCard from './participant-profile-card'
import ParticipantActivityTimeline from './participant-activity-timeline'
import ParticipantDuplicatesCard from './participant-duplicates-card'
import type { ParticipantDetailResult } from '@/lib/types/participant'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

interface ParticipantDetailTabsProps {
  orgId: string
  initialDetail: ParticipantDetailResult
  isAdmin: boolean
  canEdit: boolean
  currentUserId: string
}

export default function ParticipantDetailTabs({ 
  orgId, 
  initialDetail, 
  isAdmin, 
  canEdit,
  currentUserId 
}: ParticipantDetailTabsProps) {
  const [detail, setDetail] = useState<ParticipantDetailResult>(initialDetail)

  const editableDetail = useMemo(() => detail, [detail])

  const handleDetailUpdate = (nextDetail?: ParticipantDetailResult) => {
    if (nextDetail) {
      setDetail(nextDetail)
    }
  }

  return (
    <Tabs defaultValue="profile" className="space-y-6">
      <TabsList>
        <TabsTrigger value="profile">Профиль</TabsTrigger>
        {isAdmin && <TabsTrigger value="activity">Активность</TabsTrigger>}
        {isAdmin && <TabsTrigger value="duplicates">Дубликаты</TabsTrigger>}
      </TabsList>

      <TabsContent value="profile" className="space-y-6">
        <ParticipantProfileCard 
          orgId={orgId} 
          detail={editableDetail} 
          onDetailUpdate={handleDetailUpdate}
          canEdit={canEdit}
          isAdmin={isAdmin}
        />
      </TabsContent>

      {isAdmin && (
        <TabsContent value="activity">
          <ParticipantActivityTimeline detail={editableDetail} />
        </TabsContent>
      )}

      {isAdmin && (
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
