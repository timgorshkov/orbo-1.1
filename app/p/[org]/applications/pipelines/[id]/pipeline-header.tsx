'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Settings, LayoutGrid, AlertTriangle, Plus } from 'lucide-react'
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
  const [bannerDismissed, setBannerDismissed] = useState(false)

  return (
    <div className="flex-shrink-0 border-b bg-white">
      <div className="px-6 py-4">
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
            <Link href={hasForm 
              ? `/p/${orgId}/applications/pipelines/${pipelineId}/forms`
              : `/p/${orgId}/applications/pipelines/${pipelineId}/forms/new`
            }>
              <Button variant="outline" size="sm">
                {hasForm ? (
                  <>
                    <LayoutGrid className="w-4 h-4 mr-1" />
                    Управление формами
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-1" />
                    Создать форму
                  </>
                )}
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
      
      {/* No forms warning banner */}
      {!hasForm && !bannerDismissed && (
        <div className="px-6 pb-4">
          <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">
                У этой воронки нет формы заявки
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Без формы пользователи не смогут подавать заявки. Создайте форму, чтобы воронка начала работать.
              </p>
            </div>
            <Link href={`/p/${orgId}/applications/pipelines/${pipelineId}/forms/new`}>
              <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white">
                <Plus className="w-4 h-4 mr-1" />
                Создать форму
              </Button>
            </Link>
            <button 
              onClick={() => setBannerDismissed(true)}
              className="text-amber-600 hover:text-amber-800 text-sm px-2"
              title="Скрыть"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
