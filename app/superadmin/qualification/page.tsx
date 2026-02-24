'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, CheckCircle, TrendingUp, BarChart3, EyeOff } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';

const VISIBLE_STAT_FIELDS = ['community_type', 'pain_points'];
const STAT_TITLES: Record<string, string> = {
  community_type: 'По типу сообщества',
  pain_points: 'По болям',
};

interface QualificationSummary {
  total_users: number;
  completed_qualification: number;
  completion_rate: number;
  responses_by_field: Record<string, Record<string, number>>;
}

interface QualificationResponse {
  id: string;
  user_id: string;
  user_display: string;
  user_email: string | null;
  user_name: string | null;
  telegram_username: string | null;
  org_name: string | null;
  is_test: boolean;
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
  const [hideTest, setHideTest] = useState(true);

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

  const filteredRecent = hideTest ? recent.filter(q => !q.is_test) : recent;

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
              <span className="text-2xl font-bold">{filteredRecent.length}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Statistics by Field — only community_type and pain_points */}
      {summary?.responses_by_field && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {VISIBLE_STAT_FIELDS.map((field) => {
            const counts = summary.responses_by_field[field];
            if (!counts || Object.keys(counts).length === 0) return null;
            const fieldLabels = labels[field] || {};
            const total = Object.values(counts).reduce((a, b) => a + b, 0);
            
            return (
              <Card key={field}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    {STAT_TITLES[field] || field}
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
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Последние ответы</CardTitle>
              <CardDescription>Новые пользователи и их квалификация</CardDescription>
            </div>
            <button
              onClick={() => setHideTest(prev => !prev)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors ${
                hideTest 
                  ? 'bg-primary/10 border-primary/20 text-primary' 
                  : 'bg-muted border-border text-muted-foreground'
              }`}
            >
              <EyeOff className="h-3.5 w-3.5" />
              {hideTest ? 'Тестовые скрыты' : 'Показать все'}
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {filteredRecent.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {hideTest && recent.length > 0 
                ? 'Нет ответов (кроме тестовых). Нажмите «Показать все» для просмотра.'
                : 'Пока нет ответов на квалификацию'}
            </p>
          ) : (
            <div className="divide-y">
              {filteredRecent.map((q) => (
                <div 
                  key={q.id} 
                  className={`py-3 first:pt-0 last:pb-0 ${q.is_test ? 'opacity-50' : ''}`}
                >
                  {/* Compact Row */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className={`font-medium truncate ${q.is_test ? 'text-gray-400' : ''}`}>
                        {q.user_name || q.user_email || 'Неизвестный пользователь'}
                        {q.is_test && <span className="ml-1 text-xs">(тест)</span>}
                      </span>
                      {q.telegram_username && (
                        <a 
                          href={`https://t.me/${q.telegram_username}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className={`hover:underline text-sm ${q.is_test ? 'text-gray-400' : 'text-blue-600'}`}
                        >
                          @{q.telegram_username}
                        </a>
                      )}
                      {q.org_name && (
                        <span className="text-sm text-muted-foreground hidden sm:inline">• {q.org_name}</span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {q.completed_at ? (
                        <Badge variant="default" className={`text-xs ${q.is_test ? 'bg-gray-400' : 'bg-green-500'}`}>✓</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">...</Badge>
                      )}
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(q.created_at), { addSuffix: true, locale: ru })}
                      </span>
                    </div>
                  </div>
                  
                  {/* Answers Row — only community_type and pain_points */}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {q.responses_readable.community_type && (
                      <Badge variant="outline" className={`text-xs py-0 ${q.is_test ? 'border-gray-300 text-gray-400' : ''}`}>
                        {q.responses_readable.community_type}
                      </Badge>
                    )}
                    {q.responses_readable.pain_points && (
                      <span className={`text-xs ${q.is_test ? 'text-gray-400' : 'text-muted-foreground'}`}>
                        • {q.responses_readable.pain_points}
                      </span>
                    )}
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

