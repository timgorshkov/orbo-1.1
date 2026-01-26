'use client'

import Link from 'next/link'
import { ArrowLeft, Settings, Plus, Link as LinkIcon, Copy, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PipelineHeaderProps {
  orgId: string
  pipelineId: string
  pipelineName: string
  pipelineType: string
  description?: string
  miniAppLink: string | null
  hasForm: boolean
}

export default function PipelineHeader({
  orgId,
  pipelineId,
  pipelineName,
  pipelineType,
  description,
  miniAppLink,
  hasForm
}: PipelineHeaderProps) {
  const handleCopyLink = () => {
    if (miniAppLink) {
      navigator.clipboard.writeText(miniAppLink)
    }
  }

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
            {description && (
              <p className="text-sm text-neutral-500">{description}</p>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* MiniApp Link */}
          {miniAppLink && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-50 rounded-lg border">
              <LinkIcon className="w-4 h-4 text-neutral-400" />
              <code className="text-xs text-neutral-600 max-w-[200px] truncate">
                {miniAppLink}
              </code>
              <button 
                className="p-1 hover:bg-neutral-200 rounded"
                title="Копировать ссылку"
                onClick={handleCopyLink}
              >
                <Copy className="w-3.5 h-3.5 text-neutral-500" />
              </button>
              <a 
                href={miniAppLink}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 hover:bg-neutral-200 rounded"
                title="Открыть"
              >
                <ExternalLink className="w-3.5 h-3.5 text-neutral-500" />
              </a>
            </div>
          )}
          
          {/* Create Form */}
          {!hasForm && (
            <Link href={`/p/${orgId}/applications/pipelines/${pipelineId}/forms/new`}>
              <Button variant="outline" size="sm">
                <Plus className="w-4 h-4 mr-1" />
                Создать форму
              </Button>
            </Link>
          )}
          
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
