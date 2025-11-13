'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppConfigPreview from './app-config-preview';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

interface UserOrganization {
  id: string;
  name: string;
}

export default function AIConstructorChat() {
  const router = useRouter();
  const [conversationId] = useState<string>(() => `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Привет! Я помогу вам создать приложение. Давайте начнём с простого вопроса: **что будут публиковать ваши пользователи?**\n\nНапример:\n- Объявления о продаже/покупке\n- Заявки на услуги\n- События и мероприятия\n- Вакансии\n- Или что-то своё',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [appConfig, setAppConfig] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [userOrganizations, setUserOrganizations] = useState<UserOrganization[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch user organizations on mount
  useEffect(() => {
    fetchUserOrganizations();
  }, []);

  const fetchUserOrganizations = async () => {
    try {
      const response = await fetch('/api/user/organizations');
      if (response.ok) {
        const data = await response.json();
        setUserOrganizations(data.organizations || []);
      }
    } catch (error) {
      console.error('Failed to fetch organizations:', error);
    }
  };

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Auto-focus input after AI response
  useEffect(() => {
    if (!isLoading && !isTyping && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLoading, isTyping]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setIsTyping(true);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
          conversationId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }

      const data = await response.json();
      
      setIsTyping(false);
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);

      // If AI has generated app config, show preview
      if (data.appConfig && data.isComplete) {
        console.log('✅ App config ready:', data.appConfig);
        setAppConfig(data.appConfig);
        setShowPreview(true);
      }
    } catch (error) {
      console.error('Chat error:', error);
      setIsTyping(false);
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Извините, произошла ошибка. Попробуйте ещё раз.',
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateApp = async (orgId: string, visibility: 'public' | 'members' | 'private') => {
    try {
      console.log('[AI Constructor] Creating app for org:', orgId);
      console.log('[AI Constructor] App config:', appConfig);
      console.log('[AI Constructor] Visibility:', visibility);
      
      const response = await fetch('/api/ai/generate-app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appConfig,
          orgId,
          visibility,
          conversationId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[AI Constructor] Failed to create app:', errorData);
        throw new Error('Failed to create app');
      }

      const data = await response.json();
      console.log('[AI Constructor] App created successfully:', data);
      console.log('[AI Constructor] Redirecting to /app/' + orgId + '/apps?created=' + data.app.id);
      
      // Navigate to success page or app page
      router.push(`/app/${orgId}/apps?created=${data.app.id}`);
    } catch (error) {
      console.error('[AI Constructor] Error creating app:', error);
      alert('Не удалось создать приложение. Попробуйте ещё раз.');
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
      {/* Messages */}
      <div className="h-[500px] overflow-y-auto p-6 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-3 ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
              }`}
            >
              {/* Parse markdown-style bold */}
              <div className="prose prose-sm dark:prose-invert max-w-none">
                {message.content.split('\n').map((line, i) => (
                  <p key={i} className="mb-2 last:mb-0">
                    {line.split('**').map((part, j) =>
                      j % 2 === 1 ? <strong key={j}>{part}</strong> : part
                    )}
                  </p>
                ))}
              </div>
              <div
                className={`text-xs mt-2 ${
                  message.role === 'user'
                    ? 'text-blue-200'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {message.timestamp.toLocaleTimeString('ru-RU', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-700 rounded-lg px-4 py-3">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-gray-200 dark:border-gray-700 p-4">
        <div className="flex space-x-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Напишите ваш ответ..."
            disabled={isLoading}
            autoFocus
            className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {isLoading ? '...' : 'Отправить'}
          </button>
        </div>
      </form>

      {/* Preview Modal */}
      {showPreview && appConfig && (
        <AppConfigPreview
          config={appConfig}
          onClose={() => setShowPreview(false)}
          onCreateApp={handleCreateApp}
          userOrganizations={userOrganizations}
        />
      )}
    </div>
  );
}

