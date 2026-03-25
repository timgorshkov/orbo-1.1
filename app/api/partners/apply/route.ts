import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/services/email';

const SEGMENT_LABELS: Record<string, string> = {
  telegram_studio: 'Telegram-студия / разработка ботов',
  tech_specialist: 'Техспециалист запусков',
  producer: 'Продюсер онлайн-школы',
  community_manager: 'Комьюнити-менеджер',
  agency: 'Агентство / маркетинг',
  other: 'Другое',
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, messenger, segment, comment } = body;

    if (!name || !email) {
      return NextResponse.json({ error: 'Имя и email обязательны' }, { status: 400 });
    }

    const segmentLabel = SEGMENT_LABELS[segment] || segment || 'Не указано';

    const html = `
      <h2>Новая заявка на партнёрство Orbo</h2>
      <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
        <tr><td style="padding:6px 12px;font-weight:bold;">Имя</td><td style="padding:6px 12px;">${name}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:bold;">Email</td><td style="padding:6px 12px;"><a href="mailto:${email}">${email}</a></td></tr>
        <tr><td style="padding:6px 12px;font-weight:bold;">Мессенджер</td><td style="padding:6px 12px;">${messenger || '—'}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:bold;">Сегмент</td><td style="padding:6px 12px;">${segmentLabel}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:bold;">Комментарий</td><td style="padding:6px 12px;">${comment || '—'}</td></tr>
      </table>
    `;

    const result = await sendEmail({
      to: 'tg@orbo.ru',
      subject: `Заявка на партнёрство: ${name}`,
      html,
    });

    if (!result.success) {
      console.error('Failed to send partner application email:', result.error);
      return NextResponse.json({ error: 'Ошибка отправки' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Partner apply error:', err);
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
