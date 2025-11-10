import { Metadata } from 'next';
import AIConstructorChat from '@/components/ai-constructor/ai-constructor-chat';

export const metadata: Metadata = {
  title: 'Создать приложение с AI | Orbo',
  description: 'Создайте своё приложение за несколько минут с помощью AI-помощника',
};

export default function CreateAppPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Создайте приложение с AI 🤖
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Опишите, что вам нужно, и AI создаст готовое приложение за пару минут
          </p>
        </div>

        {/* Chat Component */}
        <AIConstructorChat />

        {/* Info Cards */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
            <div className="text-2xl mb-2">⚡</div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
              Быстрое создание
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              От идеи до работающего приложения за 2-3 минуты
            </p>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
            <div className="text-2xl mb-2">🎨</div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
              Гибкая настройка
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Модерация, категории, поля — всё под ваши нужды
            </p>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
            <div className="text-2xl mb-2">🔗</div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
              Интеграция с Telegram
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Ваша аудитория уже готова — используйте Telegram группу
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

