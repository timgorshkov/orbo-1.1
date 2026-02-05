'use client'

import Link from 'next/link'
import { ArrowLeft, Settings, LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PipelineHeaderProps {
  orgId: string
  pipelineId: string
  pipelineName: string
  pipelineType: string
  telegramGroupName?: string | null
  hasForm: boolean
}

export default function PipelineHeader({
  orgId,
  pipelineId,
  pipelineName,
  pipelineType,
  telegramGroupName,
  hasForm
}: PipelineHeaderProps) {
  return (
    <div className="flex-shrink-0 border-b bg-white px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/p/${orgId}/applications`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              {pipelineName}
              <span className={`px-2 py-0.5 text-xs rounded-full ${
                pipelineType === 'join_request' 
                  ? 'bg-green-100 text-green-700'
                  : pipelineType === 'service'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-neutral-100 text-neutral-700'
              }`}>
                {pipelineType === 'join_request' ? 'Вступление' 
                  : pipelineType === 'service' ? 'Услуги' 
                  : 'Кастомная'}
              </span>
            </h1>
            {telegramGroupName && (
              <p className="text-sm text-neutral-500">Группа: {telegramGroupName}</p>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Manage Forms */}
          <Link href={`/p/${orgId}/applications/pipelines/${pipelineId}/forms`}>
            <Button variant="outline" size="sm">
              <LayoutGrid className="w-4 h-4 mr-1" />
              {hasForm ? 'Управление формами' : 'Создать форму'}
            </Button>
          </Link>
          
          {/* Settings */}
          <Link href={`/p/${orgId}/applications/pipelines/${pipelineId}/settings`}>
            <Button variant="ghost" size="icon">
              <Settings className="w-5 h-5" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
