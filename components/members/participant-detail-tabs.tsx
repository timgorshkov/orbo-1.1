'use client'

import { useState, useMemo } from 'react';
import ParticipantProfileCard from './participant-profile-card';
import ParticipantTraitsCard from './participant-traits-card';
import ParticipantActivityTimeline from './participant-activity-timeline';
import ParticipantDuplicatesCard from './participant-duplicates-card';
import ParticipantAuditPanel from './participant-audit-panel';
import type { ParticipantDetailResult } from '@/lib/types/participant';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface ParticipantDetailTabsProps {
  orgId: string;
  initialDetail: ParticipantDetailResult;
}

export default function ParticipantDetailTabs({ orgId, initialDetail }: ParticipantDetailTabsProps) {
  const [detail, setDetail] = useState<ParticipantDetailResult>(initialDetail);

  const editableDetail = useMemo(() => detail, [detail]);

  const handleDetailUpdate = (nextDetail?: ParticipantDetailResult) => {
    if (nextDetail) {
      setDetail(nextDetail);
    }
  };

  return (
    <Tabs defaultValue="profile" className="space-y-6">
      <TabsList>
        <TabsTrigger value="profile">Профиль</TabsTrigger>
        <TabsTrigger value="traits">Характеристики</TabsTrigger>
        <TabsTrigger value="activity">Активность</TabsTrigger>
        <TabsTrigger value="duplicates">Дубликаты</TabsTrigger>
      </TabsList>

      <TabsContent value="profile" className="space-y-6">
        <ParticipantProfileCard orgId={orgId} detail={editableDetail} onDetailUpdate={handleDetailUpdate} />
        <ParticipantAuditPanel detail={editableDetail} />
      </TabsContent>

      <TabsContent value="traits">
        <ParticipantTraitsCard orgId={orgId} detail={editableDetail} onDetailUpdate={handleDetailUpdate} />
      </TabsContent>

      <TabsContent value="activity">
        <ParticipantActivityTimeline detail={editableDetail} />
      </TabsContent>

      <TabsContent value="duplicates">
        <ParticipantDuplicatesCard orgId={orgId} detail={editableDetail} onDetailUpdate={handleDetailUpdate} />
      </TabsContent>
    </Tabs>
  );
}
