'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  Calendar, 
  List, 
  Plus, 
  Send, 
  Clock, 
  CheckCircle, 
  XCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Edit,
  Trash2,
  Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

interface Announcement {
  id: string;
  title: string;
  content: string;
  target_groups: number[];  // tg_chat_id array
  scheduled_at: string;
  sent_at: string | null;
  status: 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';
  event_id: string | null;
  reminder_type: string | null;
  created_by_name: string;
  updated_by_name: string | null;
  created_at: string;
  send_results: Record<string, { success: boolean; message_id?: number; error?: string }>;
}

interface TelegramGroup {
  id: number;  // integer from telegram_groups
  tg_chat_id: number;
  title: string;
  bot_status?: string;
}

export default function AnnouncementsPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.org as string;
  
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [groups, setGroups] = useState<TelegramGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('calendar');
  
  // Calendar state
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  
  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    target_groups: [] as number[],  // tg_chat_id array
    scheduled_at: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  
  useEffect(() => {
    fetchAnnouncements();
    fetchGroups();
  }, [orgId]);
  
  const fetchAnnouncements = async () => {
    try {
      const response = await fetch(`/api/announcements?org_id=${orgId}`);
      if (response.ok) {
        const data = await response.json();
        setAnnouncements(data.announcements);
      }
    } catch (error) {
      console.error('Failed to fetch announcements:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const fetchGroups = async () => {
    try {
      const response = await fetch(`/api/telegram/groups/for-org?orgId=${orgId}`);
      if (response.ok) {
        const data = await response.json();
        // API returns array directly or in 'groups' property
        const groupsData = Array.isArray(data) ? data : (data.groups || []);
        setGroups(groupsData);
      } else {
        console.error('Failed to fetch groups:', response.status);
      }
    } catch (error) {
      console.error('Failed to fetch groups:', error);
    }
  };
  
  const handleCreateNew = () => {
    setEditingAnnouncement(null);
    const now = new Date();
    now.setHours(now.getHours() + 1, 0, 0, 0);
    setFormData({
      title: '',
      content: '',
      target_groups: groups.map(g => g.tg_chat_id), // Все группы по умолчанию
      scheduled_at: now.toISOString().slice(0, 16)
    });
    setIsDialogOpen(true);
  };
  
  const handleEdit = (announcement: Announcement) => {
    setEditingAnnouncement(announcement);
    setFormData({
      title: announcement.title,
      content: announcement.content,
      target_groups: announcement.target_groups,
      scheduled_at: new Date(announcement.scheduled_at).toISOString().slice(0, 16)
    });
    setIsDialogOpen(true);
  };
  
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const url = editingAnnouncement 
        ? `/api/announcements/${editingAnnouncement.id}`
        : '/api/announcements';
      
      const response = await fetch(url, {
        method: editingAnnouncement ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          ...formData,
          scheduled_at: new Date(formData.scheduled_at).toISOString()
        })
      });
      
      if (response.ok) {
        setIsDialogOpen(false);
        fetchAnnouncements();
      } else {
        const data = await response.json();
        alert(data.error || 'Ошибка сохранения');
      }
    } catch (error) {
      alert('Ошибка сохранения');
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleDelete = async (id: string) => {
    if (!confirm('Удалить этот анонс?')) return;
    
    try {
      const response = await fetch(`/api/announcements/${id}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        fetchAnnouncements();
      } else {
        const data = await response.json();
        alert(data.error || 'Ошибка удаления');
      }
    } catch (error) {
      alert('Ошибка удаления');
    }
  };
  
  const handleSendNow = async (id: string) => {
    if (!confirm('Отправить анонс сейчас?')) return;
    
    try {
      const response = await fetch(`/api/announcements/${id}/send`, {
        method: 'POST'
      });
      
      if (response.ok) {
        fetchAnnouncements();
      } else {
        const data = await response.json();
        alert(data.error || 'Ошибка отправки');
      }
    } catch (error) {
      alert('Ошибка отправки');
    }
  };
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
          <Clock className="w-3 h-3 mr-1" /> Запланирован
        </Badge>;
      case 'sending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
          <Send className="w-3 h-3 mr-1" /> Отправляется
        </Badge>;
      case 'sent':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
          <CheckCircle className="w-3 h-3 mr-1" /> Отправлен
        </Badge>;
      case 'failed':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
          <XCircle className="w-3 h-3 mr-1" /> Ошибка
        </Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
          <AlertCircle className="w-3 h-3 mr-1" /> Отменён
        </Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };
  
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  // Calendar helpers
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: Date[] = [];
    
    // Add padding for first week
    const startPadding = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    for (let i = startPadding; i > 0; i--) {
      days.push(new Date(year, month, 1 - i));
    }
    
    // Add all days in month
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d));
    }
    
    // Add padding for last week
    const endPadding = 7 - (days.length % 7);
    if (endPadding < 7) {
      for (let i = 1; i <= endPadding; i++) {
        days.push(new Date(year, month + 1, i));
      }
    }
    
    return days;
  };
  
  const getAnnouncementsForDate = (date: Date) => {
    return announcements.filter(a => {
      const aDate = new Date(a.scheduled_at);
      return aDate.toDateString() === date.toDateString();
    });
  };
  
  const isCurrentMonth = (date: Date) => {
    return date.getMonth() === currentDate.getMonth();
  };
  
  const isToday = (date: Date) => {
    return date.toDateString() === new Date().toDateString();
  };

  const calendarDays = getDaysInMonth(currentDate);
  
  // Filter announcements for list view
  const upcomingAnnouncements = announcements.filter(a => 
    a.status === 'scheduled' || a.status === 'sending'
  );
  const sentAnnouncements = announcements.filter(a => 
    a.status === 'sent' || a.status === 'failed'
  );
  
  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-200 rounded"></div>
          <div className="h-64 bg-gray-100 rounded"></div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Анонсы</h1>
          <p className="text-gray-600 mt-1">Массовые публикации в группы</p>
        </div>
        <Button onClick={handleCreateNew} className="gap-2">
          <Plus className="w-4 h-4" />
          Создать анонс
        </Button>
      </div>
      
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="calendar" className="gap-2">
            <Calendar className="w-4 h-4" />
            Календарь
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="gap-2">
            <Clock className="w-4 h-4" />
            Запланированные ({upcomingAnnouncements.length})
          </TabsTrigger>
          <TabsTrigger value="archive" className="gap-2">
            <List className="w-4 h-4" />
            Архив ({sentAnnouncements.length})
          </TabsTrigger>
        </TabsList>
        
        {/* Calendar Tab */}
        <TabsContent value="calendar" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle>
                  {currentDate.toLocaleString('ru-RU', { month: 'long', year: 'numeric' })}
                </CardTitle>
                <div className="flex gap-1">
                  <Button 
                    variant="outline" 
                    size="sm" className="p-2"
                    onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setCurrentDate(new Date())}
                  >
                    Сегодня
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" className="p-2"
                    onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Days of week header */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => (
                  <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">
                    {day}
                  </div>
                ))}
              </div>
              
              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((date, index) => {
                  const dayAnnouncements = getAnnouncementsForDate(date);
                  const hasAnnouncements = dayAnnouncements.length > 0;
                  
                  return (
                    <div
                      key={index}
                      className={`
                        min-h-[80px] p-1 border rounded cursor-pointer transition-colors
                        ${isCurrentMonth(date) ? 'bg-white' : 'bg-gray-50'}
                        ${isToday(date) ? 'border-blue-500 border-2' : 'border-gray-200'}
                        ${selectedDate?.toDateString() === date.toDateString() ? 'ring-2 ring-blue-300' : ''}
                        hover:bg-gray-50
                      `}
                      onClick={() => setSelectedDate(date)}
                    >
                      <div className={`text-sm font-medium ${isCurrentMonth(date) ? 'text-gray-900' : 'text-gray-400'}`}>
                        {date.getDate()}
                      </div>
                      {hasAnnouncements && (
                        <div className="mt-1 space-y-1">
                          {dayAnnouncements.slice(0, 2).map(a => (
                            <div 
                              key={a.id}
                              className={`
                                text-xs truncate px-1 py-0.5 rounded
                                ${a.status === 'sent' ? 'bg-green-100 text-green-700' : 
                                  a.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                                  a.status === 'failed' ? 'bg-red-100 text-red-700' :
                                  'bg-gray-100 text-gray-700'}
                              `}
                            >
                              {a.title}
                            </div>
                          ))}
                          {dayAnnouncements.length > 2 && (
                            <div className="text-xs text-gray-500 pl-1">
                              +{dayAnnouncements.length - 2}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              
              {/* Selected date details */}
              {selectedDate && (
                <div className="mt-4 pt-4 border-t">
                  <h3 className="font-medium mb-2">
                    {selectedDate.toLocaleDateString('ru-RU', { 
                      weekday: 'long', 
                      day: 'numeric', 
                      month: 'long' 
                    })}
                  </h3>
                  {getAnnouncementsForDate(selectedDate).length === 0 ? (
                    <p className="text-gray-500 text-sm">Нет анонсов на эту дату</p>
                  ) : (
                    <div className="space-y-2">
                      {getAnnouncementsForDate(selectedDate).map(a => (
                        <AnnouncementCard 
                          key={a.id} 
                          announcement={a}
                          groups={groups}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                          onSendNow={handleSendNow}
                          getStatusBadge={getStatusBadge}
                          formatDate={formatDate}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Upcoming Tab */}
        <TabsContent value="upcoming" className="mt-4">
          {upcomingAnnouncements.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Нет запланированных анонсов</p>
                <Button onClick={handleCreateNew} className="mt-4" variant="outline">
                  Создать анонс
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {upcomingAnnouncements.map(a => (
                <AnnouncementCard 
                  key={a.id} 
                  announcement={a}
                  groups={groups}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onSendNow={handleSendNow}
                  getStatusBadge={getStatusBadge}
                  formatDate={formatDate}
                />
              ))}
            </div>
          )}
        </TabsContent>
        
        {/* Archive Tab */}
        <TabsContent value="archive" className="mt-4">
          {sentAnnouncements.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <List className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Архив пуст</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {sentAnnouncements.map(a => (
                <AnnouncementCard 
                  key={a.id} 
                  announcement={a}
                  groups={groups}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onSendNow={handleSendNow}
                  getStatusBadge={getStatusBadge}
                  formatDate={formatDate}
                  isArchive
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
      
      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingAnnouncement ? 'Редактировать анонс' : 'Новый анонс'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="title">Заголовок (для себя)</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Например: Анонс встречи 15 января"
              />
              <p className="text-xs text-gray-500 mt-1">Не будет отправлен в группы</p>
            </div>
            
            <div>
              <Label htmlFor="content">Текст сообщения</Label>
              <Textarea
                id="content"
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="Текст анонса с поддержкой Telegram Markdown..."
                rows={6}
              />
              <p className="text-xs text-gray-500 mt-1">
                Поддерживается: *жирный*, _курсив_, ~зачёркнутый~, `код`, [ссылка](url)
              </p>
            </div>
            
            <div>
              <Label htmlFor="scheduled_at">Дата и время отправки</Label>
              <Input
                id="scheduled_at"
                type="datetime-local"
                value={formData.scheduled_at}
                onChange={(e) => setFormData({ ...formData, scheduled_at: e.target.value })}
              />
            </div>
            
            <div>
              <Label>Целевые группы</Label>
              <div className="mt-2 space-y-2 max-h-64 overflow-y-auto border rounded p-2">
                {groups.length === 0 ? (
                  <p className="text-gray-500 text-sm">Нет доступных групп</p>
                ) : (
                  <>
                    <div className="flex items-center gap-2 pb-2 border-b">
                      <Checkbox
                        id="all-groups"
                        checked={formData.target_groups.length === groups.length}
                        onCheckedChange={(checked) => {
                          setFormData({
                            ...formData,
                            target_groups: checked ? groups.map(g => g.tg_chat_id) : []
                          });
                        }}
                      />
                      <Label htmlFor="all-groups" className="font-medium">Все группы</Label>
                    </div>
                    {groups.map(group => (
                      <div key={group.tg_chat_id} className="flex items-center gap-2">
                        <Checkbox
                          id={String(group.tg_chat_id)}
                          checked={formData.target_groups.includes(group.tg_chat_id)}
                          onCheckedChange={(checked) => {
                            setFormData({
                              ...formData,
                              target_groups: checked
                                ? [...formData.target_groups, group.tg_chat_id]
                                : formData.target_groups.filter(id => id !== group.tg_chat_id)
                            });
                          }}
                        />
                        <Label htmlFor={String(group.tg_chat_id)}>
                          {group.title || 'Без названия'}
                        </Label>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Отмена
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={isSaving || !formData.title || !formData.content || formData.target_groups.length === 0}
            >
              {isSaving ? 'Сохранение...' : (editingAnnouncement ? 'Сохранить' : 'Создать')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Announcement Card Component
function AnnouncementCard({
  announcement,
  groups,
  onEdit,
  onDelete,
  onSendNow,
  getStatusBadge,
  formatDate,
  isArchive = false
}: {
  announcement: Announcement;
  groups: TelegramGroup[];
  onEdit: (a: Announcement) => void;
  onDelete: (id: string) => void;
  onSendNow: (id: string) => void;
  getStatusBadge: (status: string) => React.ReactNode;
  formatDate: (date: string) => string;
  isArchive?: boolean;
}) {
  const targetGroupNames = announcement.target_groups
    .map(chatId => groups.find(g => g.tg_chat_id === chatId)?.title)
    .filter(Boolean)
    .slice(0, 3);
  
  const moreGroups = announcement.target_groups.length - 3;
  
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {getStatusBadge(announcement.status)}
              {announcement.reminder_type && (
                <Badge variant="secondary" className="text-xs">
                  Напоминание {announcement.reminder_type}
                </Badge>
              )}
            </div>
            
            <h3 className="font-medium text-gray-900 truncate">{announcement.title}</h3>
            
            <p className="text-sm text-gray-600 mt-1 line-clamp-2 whitespace-pre-wrap">
              {announcement.content}
            </p>
            
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDate(announcement.scheduled_at)}
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {targetGroupNames.join(', ')}
                {moreGroups > 0 && ` +${moreGroups}`}
              </span>
            </div>
            
            <div className="text-xs text-gray-400 mt-1">
              Автор: {announcement.created_by_name}
              {announcement.updated_by_name && announcement.updated_by_name !== announcement.created_by_name && (
                <> • Изменил: {announcement.updated_by_name}</>
              )}
            </div>
          </div>
          
          {!isArchive && announcement.status === 'scheduled' && (
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="p-2" onClick={() => onSendNow(announcement.id)} title="Отправить сейчас">
                <Send className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" className="p-2" onClick={() => onEdit(announcement)} title="Редактировать">
                <Edit className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" className="p-2" onClick={() => onDelete(announcement.id)} title="Удалить">
                <Trash2 className="w-4 h-4 text-red-500" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

