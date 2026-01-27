'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, User, Clock, ChevronRight, MoreHorizontal, Loader2 } from 'lucide-react'

interface Stage {
  id: string
  name: string
  slug: string
  color: string
  position: number
  is_initial: boolean
  is_terminal: boolean
  terminal_type: string | null
}

interface Application {
  id: string
  stage_id: string
  tg_user_id: number
  tg_user_data: any
  form_data: any
  form_filled_at: string | null
  spam_score: number
  spam_reasons: string[]
  created_at: string
  participant?: {
    id: string
    username: string | null
    full_name: string | null
    photo_url: string | null
  }
}

interface PipelineKanbanProps {
  orgId: string
  pipelineId: string
  stages: Stage[]
  applicationsByStage: Record<string, Application[]>
  stageStats: Record<string, number>
}

export default function PipelineKanban({
  orgId,
  pipelineId,
  stages,
  applicationsByStage: initialApplicationsByStage,
  stageStats: initialStageStats
}: PipelineKanbanProps) {
  const router = useRouter()
  const [draggedApp, setDraggedApp] = useState<Application | null>(null)
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)
  const [movingAppId, setMovingAppId] = useState<string | null>(null)
  
  // Local state for optimistic updates
  const [applicationsByStage, setApplicationsByStage] = useState(initialApplicationsByStage)
  const [stageStats, setStageStats] = useState(initialStageStats)

  const handleDragStart = (app: Application) => {
    setDraggedApp(app)
  }

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault()
    setDragOverStage(stageId)
  }

  const handleDragLeave = () => {
    setDragOverStage(null)
  }

  const handleDrop = async (e: React.DragEvent, targetStageId: string) => {
    e.preventDefault()
    setDragOverStage(null)
    
    if (!draggedApp || draggedApp.stage_id === targetStageId) {
      setDraggedApp(null)
      return
    }
    
    // Check if current stage is terminal
    const currentStage = stages.find(s => s.id === draggedApp.stage_id)
    if (currentStage?.is_terminal) {
      // Can't move from terminal stage
      setDraggedApp(null)
      return
    }
    
    const sourceStageId = draggedApp.stage_id
    const appToMove = draggedApp
    
    // Optimistic update
    setMovingAppId(appToMove.id)
    setApplicationsByStage(prev => {
      const newState = { ...prev }
      // Remove from source
      newState[sourceStageId] = (newState[sourceStageId] || []).filter(a => a.id !== appToMove.id)
      // Add to target
      const movedApp = { ...appToMove, stage_id: targetStageId }
      newState[targetStageId] = [movedApp, ...(newState[targetStageId] || [])]
      return newState
    })
    setStageStats(prev => ({
      ...prev,
      [sourceStageId]: Math.max(0, (prev[sourceStageId] || 0) - 1),
      [targetStageId]: (prev[targetStageId] || 0) + 1
    }))
    
    setDraggedApp(null)
    
    try {
      const res = await fetch(`/api/applications/${appToMove.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_id: targetStageId })
      })
      
      if (!res.ok) {
        // Revert on error
        setApplicationsByStage(prev => {
          const newState = { ...prev }
          newState[targetStageId] = (newState[targetStageId] || []).filter(a => a.id !== appToMove.id)
          newState[sourceStageId] = [appToMove, ...(newState[sourceStageId] || [])]
          return newState
        })
        setStageStats(prev => ({
          ...prev,
          [sourceStageId]: (prev[sourceStageId] || 0) + 1,
          [targetStageId]: Math.max(0, (prev[targetStageId] || 0) - 1)
        }))
      } else {
        // Refresh server data in background
        router.refresh()
      }
    } catch (err) {
      console.error('Failed to move application:', err)
      // Revert on error
      setApplicationsByStage(prev => {
        const newState = { ...prev }
        newState[targetStageId] = (newState[targetStageId] || []).filter(a => a.id !== appToMove.id)
        newState[sourceStageId] = [appToMove, ...(newState[sourceStageId] || [])]
        return newState
      })
      setStageStats(prev => ({
        ...prev,
        [sourceStageId]: (prev[sourceStageId] || 0) + 1,
        [targetStageId]: Math.max(0, (prev[targetStageId] || 0) - 1)
      }))
    } finally {
      setMovingAppId(null)
    }
  }

  const formatTimeAgo = (date: string) => {
    const now = new Date()
    const then = new Date(date)
    const diffMs = now.getTime() - then.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    
    if (diffMins < 60) return `${diffMins}м`
    if (diffHours < 24) return `${diffHours}ч`
    return `${diffDays}д`
  }

  const getDisplayName = (app: Application) => {
    const userData = app.tg_user_data || {}
    return app.participant?.full_name 
      || [userData.first_name, userData.last_name].filter(Boolean).join(' ')
      || userData.username
      || `User ${app.tg_user_id}`
  }

  const getUsername = (app: Application) => {
    return app.participant?.username || app.tg_user_data?.username
  }

  const getPhotoUrl = (app: Application) => {
    return app.participant?.photo_url || app.tg_user_data?.photo_url
  }

  return (
    <div className="h-full overflow-x-auto p-4">
      <div className="flex gap-4 h-full min-w-max">
        {stages.map((stage) => {
          const apps = applicationsByStage[stage.id] || []
          const count = stageStats[stage.id] || 0
          const isDropTarget = dragOverStage === stage.id && draggedApp?.stage_id !== stage.id
          
          return (
            <div 
              key={stage.id}
              className={`w-80 flex-shrink-0 flex flex-col bg-neutral-50 rounded-xl transition-colors ${
                isDropTarget ? 'bg-blue-50 ring-2 ring-blue-300' : ''
              }`}
              onDragOver={(e) => handleDragOver(e, stage.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, stage.id)}
            >
              {/* Stage Header */}
              <div className="flex-shrink-0 p-3 border-b border-neutral-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: stage.color }}
                    />
                    <span className="font-medium">{stage.name}</span>
                    <span className="px-2 py-0.5 text-xs bg-neutral-200 rounded-full">
                      {count}
                    </span>
                  </div>
                  {stage.is_terminal && (
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                      stage.terminal_type === 'success' 
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {stage.terminal_type === 'success' ? 'Успех' : 'Отказ'}
                    </span>
                  )}
                </div>
              </div>
              
              {/* Applications List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {apps.length === 0 ? (
                  <div className="text-center py-8 text-neutral-400 text-sm">
                    Нет заявок
                  </div>
                ) : (
                  apps.map((app) => (
                    <Link
                      key={app.id}
                      href={`/p/${orgId}/applications/${app.id}`}
                      draggable={!stages.find(s => s.id === app.stage_id)?.is_terminal}
                      onDragStart={() => handleDragStart(app)}
                      onDragEnd={() => setDraggedApp(null)}
                      className={`block bg-white rounded-lg border p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer ${
                        draggedApp?.id === app.id ? 'opacity-50' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Avatar */}
                        <div className="flex-shrink-0">
                          {getPhotoUrl(app) ? (
                            <img 
                              src={getPhotoUrl(app)}
                              alt=""
                              className="w-10 h-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-neutral-200 flex items-center justify-center">
                              <User className="w-5 h-5 text-neutral-500" />
                            </div>
                          )}
                        </div>
                        
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {getDisplayName(app)}
                          </div>
                          {getUsername(app) && (
                            <div className="text-sm text-neutral-500 truncate">
                              @{getUsername(app)}
                            </div>
                          )}
                          
                          {/* Badges */}
                          <div className="flex items-center gap-2 mt-2">
                            {/* Spam Score */}
                            {app.spam_score > 50 && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-red-100 text-red-700 rounded">
                                <AlertTriangle className="w-3 h-3" />
                                {app.spam_score}
                              </span>
                            )}
                            
                            {/* Form Status */}
                            {!app.form_filled_at && (
                              <span className="px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700 rounded">
                                Без анкеты
                              </span>
                            )}
                            
                            {/* Time */}
                            <span className="inline-flex items-center gap-1 text-xs text-neutral-400">
                              <Clock className="w-3 h-3" />
                              {formatTimeAgo(app.created_at)}
                            </span>
                          </div>
                        </div>
                        
                        {/* Arrow */}
                        <ChevronRight className="w-4 h-4 text-neutral-300 flex-shrink-0" />
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
