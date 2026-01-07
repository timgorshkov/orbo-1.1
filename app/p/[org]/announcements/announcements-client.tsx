'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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

interface AnnouncementsClientProps {
  orgId: string;
}

export default function AnnouncementsClient({ orgId }: AnnouncementsClientProps) {
  const router = useRouter();
  
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
      scheduled_at: announcement.scheduled_at.slice(0, 16)
    });
    setIsDialogOpen(true);
  };
  
  const handleSave = async () => {
    if (!formData.title || !formData.content || !formData.scheduled_at) {
      alert('Заполните все обязательные поля');
      return;
    }
    
    setIsSaving(true);
    try {
      const url = editingAnnouncement 
        ? `/api/announcements/${editingAnnouncement.id}` 
        : '/api/announcements';
      
      const method = editingAnnouncement ? 'PATCH' : 'POST';
      
      const response = await fetch(url, {
        method,
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
        const error = await response.json();
        alert(error.error || 'Ошибка при сохранении');
      }
    } catch (error) {
      console.error('Failed to save announcement:', error);
      alert('Ошибка при сохранении');
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleDelete = async (id: string) => {
    if (!confirm('Удалить анонс?')) return;
    
    try {
      const response = await fetch(`/api/announcements/${id}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        fetchAnnouncements();
      }
    } catch (error) {
      console.error('Failed to delete announcement:', error);
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
        const error = await response.json();
        alert(error.error || 'Ошибка при отправке');
      }
    } catch (error) {
      console.error('Failed to send announcement:', error);
    }
  };
  
  // Calendar helpers
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: (Date | null)[] = [];
    
    // Add empty days for alignment
    const startDayOfWeek = firstDay.getDay();
    const adjustedStartDay = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1; // Monday = 0
    for (let i = 0; i < adjustedStartDay; i++) {
      days.push(null);
    }
    
    // Add days of month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }
    
    return days;
  };
  
  const getAnnouncementsForDate = (date: Date) => {
    return announcements.filter(a => {
      const announcementDate = new Date(a.scheduled_at);
      return (
        announcementDate.getDate() === date.getDate() &&
        announcementDate.getMonth() === date.getMonth() &&
        announcementDate.getFullYear() === date.getFullYear()
      );
    });
  };
  
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  const getStatusBadge = (status: Announcement['status']) => {
    switch (status) {
      case 'scheduled':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700"><Clock className="w-3 h-3 mr-1" />Запланирован</Badge>;
      case 'sending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700"><AlertCircle className="w-3 h-3 mr-1" />Отправляется</Badge>;
      case 'sent':
        return <Badge variant="outline" className="bg-green-50 text-green-700"><CheckCircle className="w-3 h-3 mr-1" />Отправлен</Badge>;
      case 'failed':
        return <Badge variant="outline" className="bg-red-50 text-red-700"><XCircle className="w-3 h-3 mr-1" />Ошибка</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="bg-gray-50 text-gray-700"><XCircle className="w-3 h-3 mr-1" />Отменён</Badge>;
    }
  };
  
  const monthNames = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];
  
  const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  
  const days = getDaysInMonth(currentDate);
  const today = new Date();
  
  const scheduledAnnouncements = announcements.filter(a => a.status === 'scheduled');
  const sentAnnouncements = announcements.filter(a => a.status === 'sent' || a.status === 'failed');
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }
  
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Анонсы</h1>
          <p className="text-gray-500">Управление рассылками в группы</p>
        </div>
        <Button onClick={handleCreateNew}>
          <Plus className="w-4 h-4 mr-2" />
          Создать анонс
        </Button>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="calendar" className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            <span className="hidden sm:inline">Календарь</span>
          </TabsTrigger>
          <TabsTrigger value="scheduled" className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            <span className="hidden sm:inline">Запланированные</span>
            {scheduledAnnouncements.length > 0 && (
              <Badge variant="secondary" className="ml-1">{scheduledAnnouncements.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="archive" className="flex items-center gap-2">
            <List className="w-4 h-4" />
            <span className="hidden sm:inline">Архив</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="calendar">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <CardTitle className="text-lg">
                  {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                </CardTitle>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-1">
                {dayNames.map(day => (
                  <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">
                    {day}
                  </div>
                ))}
                {days.map((day, index) => {
                  if (!day) {
                    return <div key={`empty-${index}`} className="aspect-square" />;
                  }
                  
                  const dayAnnouncements = getAnnouncementsForDate(day);
                  const isToday = day.toDateString() === today.toDateString();
                  const isSelected = selectedDate?.toDateString() === day.toDateString();
                  
                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelectedDate(day)}
                      className={`
                        aspect-square p-1 rounded-lg text-sm relative
                        hover:bg-gray-100 transition-colors
                        ${isToday ? 'bg-blue-50 font-bold' : ''}
                        ${isSelected ? 'ring-2 ring-blue-500' : ''}
                      `}
                    >
                      <span className={isToday ? 'text-blue-600' : ''}>{day.getDate()}</span>
                      {dayAnnouncements.length > 0 && (
                        <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 flex gap-0.5">
                          {dayAnnouncements.slice(0, 3).map((a, i) => (
                            <div
                              key={i}
                              className={`w-1.5 h-1.5 rounded-full ${
                                a.status === 'sent' ? 'bg-green-500' :
                                a.status === 'scheduled' ? 'bg-blue-500' :
                                'bg-red-500'
                              }`}
                            />
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              
              {selectedDate && (
                <div className="mt-4 pt-4 border-t">
                  <h3 className="font-medium mb-2">
                    {selectedDate.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </h3>
                  {getAnnouncementsForDate(selectedDate).length === 0 ? (
                    <p className="text-gray-500 text-sm">Нет анонсов на этот день</p>
                  ) : (
                    <div className="space-y-2">
                      {getAnnouncementsForDate(selectedDate).map(announcement => (
                        <AnnouncementCard
                          key={announcement.id}
                          announcement={announcement}
                          groups={groups}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                          onSendNow={handleSendNow}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="scheduled">
          <div className="space-y-4">
            {scheduledAnnouncements.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-gray-500">
                  Нет запланированных анонсов
                </CardContent>
              </Card>
            ) : (
              scheduledAnnouncements.map(announcement => (
                <AnnouncementCard
                  key={announcement.id}
                  announcement={announcement}
                  groups={groups}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onSendNow={handleSendNow}
                />
              ))
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="archive">
          <div className="space-y-4">
            {sentAnnouncements.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-gray-500">
                  Нет отправленных анонсов
                </CardContent>
              </Card>
            ) : (
              sentAnnouncements.map(announcement => (
                <AnnouncementCard
                  key={announcement.id}
                  announcement={announcement}
                  groups={groups}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onSendNow={handleSendNow}
                  showResults
                />
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
      
      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingAnnouncement ? 'Редактировать анонс' : 'Создать анонс'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="title">Заголовок</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Название анонса"
              />
            </div>
            
            <div>
              <Label htmlFor="content">Текст сообщения</Label>
              <Textarea
                id="content"
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="Поддерживается Telegram Markdown: *жирный*, _курсив_, `код`"
                rows={5}
              />
              <p className="text-xs text-gray-500 mt-1">
                Поддерживается форматирование: *жирный*, _курсив_, `код`, [ссылка](url)
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
            <Button onClick={handleSave} disabled={isSaving}>
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
  showResults = false
}: {
  announcement: Announcement;
  groups: TelegramGroup[];
  onEdit: (a: Announcement) => void;
  onDelete: (id: string) => void;
  onSendNow: (id: string) => void;
  showResults?: boolean;
}) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  const getStatusBadge = (status: Announcement['status']) => {
    switch (status) {
      case 'scheduled':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700"><Clock className="w-3 h-3 mr-1" />Запланирован</Badge>;
      case 'sending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700"><AlertCircle className="w-3 h-3 mr-1" />Отправляется</Badge>;
      case 'sent':
        return <Badge variant="outline" className="bg-green-50 text-green-700"><CheckCircle className="w-3 h-3 mr-1" />Отправлен</Badge>;
      case 'failed':
        return <Badge variant="outline" className="bg-red-50 text-red-700"><XCircle className="w-3 h-3 mr-1" />Ошибка</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="bg-gray-50 text-gray-700"><XCircle className="w-3 h-3 mr-1" />Отменён</Badge>;
    }
  };
  
  const getGroupTitles = (groupIds: number[]) => {
    return groupIds
      .map(chatId => groups.find(g => g.tg_chat_id === chatId)?.title)
      .filter(Boolean)
      .join(', ');
  };
  
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium truncate">{announcement.title}</h3>
              {getStatusBadge(announcement.status)}
            </div>
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">{announcement.content}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDate(announcement.scheduled_at)}
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {announcement.target_groups.length} групп
              </span>
              {announcement.created_by_name && (
                <span>Автор: {announcement.created_by_name}</span>
              )}
            </div>
            {showResults && announcement.send_results && Object.keys(announcement.send_results).length > 0 && (
              <div className="mt-2 text-xs">
                <span className="text-green-600">
                  ✓ {Object.values(announcement.send_results).filter(r => r.success).length}
                </span>
                {' / '}
                <span className="text-red-600">
                  ✗ {Object.values(announcement.send_results).filter(r => !r.success).length}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {announcement.status === 'scheduled' && (
              <>
                <Button variant="ghost" size="sm" onClick={() => onSendNow(announcement.id)}>
                  <Send className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onEdit(announcement)}>
                  <Edit className="w-4 h-4" />
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={() => onDelete(announcement.id)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

