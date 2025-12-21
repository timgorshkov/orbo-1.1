'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, CheckCircle, TrendingUp, BarChart3 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';

interface QualificationSummary {
  total_users: number;
  completed_qualification: number;
  completion_rate: number;
  responses_by_field: {
    role?: Record<string, number>;
    community_type?: Record<string, number>;
    groups_count?: Record<string, number>;
    pain_points?: Record<string, number>;
  };
}

interface QualificationResponse {
  id: string;
  user_id: string;
  user_display: string;
  user_email: string | null;
  user_name: string | null;
  telegram_username: string | null;
  org_name: string | null;
  responses: Record<string, unknown>;
  responses_readable: Record<string, string>;
  form_version: string;
  completed_at: string | null;
  created_at: string;
}

interface Labels {
  [key: string]: Record<string, string>;
}

export default function QualificationPage() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<QualificationSummary | null>(null);
  const [recent, setRecent] = useState<QualificationResponse[]>([]);
  const [labels, setLabels] = useState<Labels>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/superadmin/qualification');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setSummary(data.summary);
      setRecent(data.recent);
      setLabels(data.labels);
    } catch (err) {
      setError('Не удалось загрузить данные');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center text-destructive">{error}</div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Квалификация пользователей</h1>
        <p className="text-muted-foreground">
          Ответы пользователей на onboarding-опрос
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Всего пользователей</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <span className="text-2xl font-bold">{summary?.total_users || 0}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Прошли опрос</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span className="text-2xl font-bold">{summary?.completed_qualification || 0}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Конверсия</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              <span className="text-2xl font-bold">{summary?.completion_rate || 0}%</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ответов</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-purple-500" />
              <span className="text-2xl font-bold">{recent.length}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Statistics by Field */}
      {summary?.responses_by_field && Object.keys(summary.responses_by_field).length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(summary.responses_by_field).map(([field, counts]) => {
            if (!counts || Object.keys(counts).length === 0) return null;
            const fieldLabels = labels[field] || {};
            const total = Object.values(counts).reduce((a, b) => a + b, 0);
            
            return (
              <Card key={field}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    {field === 'role' && 'По роли'}
                    {field === 'community_type' && 'По типу сообщества'}
                    {field === 'groups_count' && 'По количеству групп'}
                    {field === 'pain_points' && 'По болям'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(counts)
                      .sort(([, a], [, b]) => b - a)
                      .map(([value, count]) => {
                        const percent = total > 0 ? Math.round((count / total) * 100) : 0;
                        return (
                          <div key={value} className="flex items-center gap-2">
                            <div className="flex-1">
                              <div className="flex justify-between text-sm mb-1">
                                <span>{fieldLabels[value] || value}</span>
                                <span className="text-muted-foreground">{count} ({percent}%)</span>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-primary rounded-full transition-all"
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Recent Responses */}
      <Card>
        <CardHeader>
          <CardTitle>Последние ответы</CardTitle>
          <CardDescription>Новые пользователи и их квалификация</CardDescription>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Пока нет ответов на квалификацию
            </p>
          ) : (
            <div className="space-y-4">
              {recent.map((q) => (
                <div 
                  key={q.id} 
                  className="border rounded-lg p-4 space-y-3"
                >
                  {/* User Info Header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-base">
                          {q.user_name || q.user_email || q.user_id.slice(0, 8) + '...'}
                        </span>
                        {q.completed_at ? (
                          <Badge variant="default" className="bg-green-500">Завершено</Badge>
                        ) : (
                          <Badge variant="secondary">В процессе</Badge>
                        )}
                      </div>
                      
                      {/* Contact Info */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                        {q.user_email && (
                          <span>📧 {q.user_email}</span>
                        )}
                        {q.telegram_username && (
                          <span>
                            <a 
                              href={`https://t.me/${q.telegram_username}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              @{q.telegram_username}
                            </a>
                          </span>
                        )}
                        {q.org_name && (
                          <span>🏢 {q.org_name}</span>
                        )}
                      </div>
                    </div>
                    
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(q.created_at), { addSuffix: true, locale: ru })}
                    </span>
                  </div>
                  
                  {/* Qualification Answers */}
                  <div className="flex flex-wrap gap-2">
                    {q.responses_readable.role && (
                      <Badge variant="outline">
                        👤 {q.responses_readable.role}
                      </Badge>
                    )}
                    {q.responses_readable.community_type && (
                      <Badge variant="outline">
                        🏢 {q.responses_readable.community_type}
                      </Badge>
                    )}
                    {q.responses_readable.groups_count && (
                      <Badge variant="outline">
                        💬 {q.responses_readable.groups_count} групп
                      </Badge>
                    )}
                  </div>

                  {q.responses_readable.pain_points && (
                    <div className="text-sm text-muted-foreground">
                      <span className="font-medium">Боли:</span> {q.responses_readable.pain_points}
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground">
                    ID: {q.user_id.slice(0, 8)}... | Версия: {q.form_version}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

