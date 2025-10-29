/**
 * Удаление пользователя через Supabase Admin API
 * Используйте этот скрипт, если SQL-скрипт не смог удалить пользователя
 * из-за недостатка прав
 */

const USER_ID_TO_DELETE = 'd64f3cd8-093e-496a-868a-cf1bece66ee4';

// Укажите ваш Supabase URL и Service Role Key
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SERVICE_ROLE_KEY';

async function deleteUser(userId) {
  console.log('========================================');
  console.log('УДАЛЕНИЕ ПОЛЬЗОВАТЕЛЯ ЧЕРЕЗ ADMIN API');
  console.log('========================================');
  console.log(`User ID: ${userId}`);
  console.log('');

  try {
    const response = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users/${userId}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`Response status: ${response.status}`);

    if (response.ok) {
      console.log('');
      console.log('========================================');
      console.log('✅✅✅ ПОЛЬЗОВАТЕЛЬ УСПЕШНО УДАЛЁН! ✅✅✅');
      console.log('========================================');
      return true;
    } else {
      const errorData = await response.json().catch(() => ({}));
      console.error('');
      console.error('========================================');
      console.error('❌ ОШИБКА ПРИ УДАЛЕНИИ');
      console.error('========================================');
      console.error('Status:', response.status);
      console.error('Error:', errorData);
      console.error('');
      console.error('Возможные причины:');
      console.error('1. Неверный Service Role Key');
      console.error('2. Пользователь уже удален');
      console.error('3. Остались foreign key constraints в БД');
      console.error('');
      return false;
    }
  } catch (error) {
    console.error('');
    console.error('========================================');
    console.error('❌ ОШИБКА СЕТИ');
    console.error('========================================');
    console.error('Error:', error.message);
    console.error('');
    return false;
  }
}

// Запуск
if (require.main === module) {
  if (SUPABASE_URL === 'YOUR_SUPABASE_URL' || SUPABASE_SERVICE_ROLE_KEY === 'YOUR_SERVICE_ROLE_KEY') {
    console.error('');
    console.error('❌ ОШИБКА: Не указаны переменные окружения');
    console.error('');
    console.error('Установите переменные окружения:');
    console.error('  NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co');
    console.error('  SUPABASE_SERVICE_ROLE_KEY=eyJxxx...');
    console.error('');
    console.error('Или отредактируйте этот файл и укажите значения напрямую.');
    console.error('');
    process.exit(1);
  }

  deleteUser(USER_ID_TO_DELETE)
    .then((success) => {
      process.exit(success ? 0 : 1);
    });
}

module.exports = { deleteUser };


