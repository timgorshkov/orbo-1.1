import formData from 'form-data'
import Mailgun from 'mailgun.js'
import { createServiceLogger } from '@/lib/logger'

const logger = createServiceLogger('EmailService');

interface SendEmailParams {
  to: string
  subject: string
  html: string
  text?: string
}

class EmailService {
  private mailgun: any
  private domain: string
  private fromEmail: string

  constructor() {
    const apiKey = process.env.MAILGUN_API_KEY
    const domain = process.env.MAILGUN_DOMAIN
    const fromEmail = process.env.MAILGUN_FROM_EMAIL || 'noreply@orbo.ru'

    if (!apiKey || !domain) {
      logger.info({}, 'Mailgun not configured. Email sending will be disabled.');
      this.mailgun = null
      this.domain = ''
      this.fromEmail = fromEmail
      return
    }

    const mailgunClient = new Mailgun(formData)
    this.mailgun = mailgunClient.client({ username: 'api', key: apiKey })
    this.domain = domain
    this.fromEmail = fromEmail
  }

  async sendEmail({ to, subject, html, text }: SendEmailParams): Promise<boolean> {
    if (!this.mailgun) {
      logger.debug({ 
        to,
        subject,
        content_preview: (text || html).substring(0, 100)
      }, 'Mailgun not configured, skipping email send');
      return false
    }

    try {
      const result = await this.mailgun.messages.create(this.domain, {
        from: this.fromEmail,
        to: [to],
        subject,
        html,
        text: text || this.stripHtml(html)
      })

      logger.info({ to, message_id: result.id }, 'Email sent successfully');
      return true
    } catch (error) {
      logger.error({ 
        to,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, 'Failed to send email');
      return false
    }
  }

  async sendVerificationCode(email: string, code: string, userName?: string): Promise<boolean> {
    const subject = 'Код подтверждения Orbo'
    const html = this.getVerificationCodeTemplate(code, userName)

    return this.sendEmail({ to: email, subject, html })
  }

  async sendAdminInvitation(email: string, inviteLink: string, orgName: string, invitedBy: string): Promise<boolean> {
    const subject = `Приглашение в команду ${orgName}`
    const html = this.getAdminInvitationTemplate(inviteLink, orgName, invitedBy)

    return this.sendEmail({ to: email, subject, html })
  }

  async sendAdminNotification(email: string, orgName: string): Promise<boolean> {
    const subject = `Вы добавлены в команду ${orgName}`
    const html = this.getAdminNotificationTemplate(orgName)

    return this.sendEmail({ to: email, subject, html })
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim()
  }

  private getVerificationCodeTemplate(code: string, userName?: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Код подтверждения</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Orbo</h1>
  </div>
  
  <div style="background: #ffffff; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    ${userName ? `<p style="font-size: 16px; margin-bottom: 20px;">Привет, ${userName}!</p>` : ''}
    
    <p style="font-size: 16px; margin-bottom: 20px;">Ваш код подтверждения для активации профиля администратора:</p>
    
    <div style="background: #f3f4f6; border: 2px solid #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0;">
      <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #667eea; font-family: 'Courier New', monospace;">
        ${code}
      </div>
    </div>
    
    <p style="font-size: 14px; color: #6b7280; margin-bottom: 20px;">
      Код действителен в течение 15 минут.
    </p>
    
    <p style="font-size: 14px; color: #6b7280; margin-bottom: 0;">
      Если вы не запрашивали этот код, просто проигнорируйте это письмо.
    </p>
  </div>
  
  <div style="text-align: center; margin-top: 30px; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 5px 0;">© 2025 Orbo. Все права защищены.</p>
    <p style="margin: 5px 0;">Платформа для управления сообществами</p>
  </div>
</body>
</html>
    `.trim()
  }

  private getAdminInvitationTemplate(inviteLink: string, orgName: string, invitedBy: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Приглашение в команду</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Orbo</h1>
  </div>
  
  <div style="background: #ffffff; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    <h2 style="color: #1f2937; margin-top: 0; margin-bottom: 20px;">Приглашение в команду</h2>
    
    <p style="font-size: 16px; margin-bottom: 20px;">
      <strong>${invitedBy}</strong> пригласил вас стать администратором в организации <strong>${orgName}</strong>.
    </p>
    
    <p style="font-size: 16px; margin-bottom: 30px;">
      Как администратор, вы сможете:
    </p>
    
    <ul style="font-size: 15px; color: #4b5563; margin-bottom: 30px; padding-left: 20px;">
      <li style="margin-bottom: 10px;">Создавать и редактировать материалы</li>
      <li style="margin-bottom: 10px;">Организовывать события</li>
      <li style="margin-bottom: 10px;">Управлять участниками</li>
      <li style="margin-bottom: 10px;">Просматривать аналитику</li>
    </ul>
    
    <div style="text-align: center; margin: 40px 0;">
      <a href="${inviteLink}" style="display: inline-block; background: #667eea; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
        Принять приглашение
      </a>
    </div>
    
    <p style="font-size: 13px; color: #9ca3af; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
      Если кнопка не работает, скопируйте и вставьте эту ссылку в браузер:<br>
      <a href="${inviteLink}" style="color: #667eea; word-break: break-all;">${inviteLink}</a>
    </p>
    
    <p style="font-size: 14px; color: #6b7280; margin-top: 20px; margin-bottom: 0;">
      Ссылка действительна в течение 7 дней.
    </p>
  </div>
  
  <div style="text-align: center; margin-top: 30px; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 5px 0;">© 2025 Orbo. Все права защищены.</p>
    <p style="margin: 5px 0;">Платформа для управления сообществами</p>
  </div>
</body>
</html>
    `.trim()
  }

  private getAdminNotificationTemplate(orgName: string): string {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://my.orbo.ru'
    
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Добро пожаловать в команду</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Orbo</h1>
  </div>
  
  <div style="background: #ffffff; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    <h2 style="color: #1f2937; margin-top: 0; margin-bottom: 20px;">Добро пожаловать в команду! 🎉</h2>
    
    <p style="font-size: 16px; margin-bottom: 20px;">
      Вы добавлены в команду организации <strong>${orgName}</strong> с правами администратора.
    </p>
    
    <p style="font-size: 16px; margin-bottom: 30px;">
      Вы можете сразу начать работу:
    </p>
    
    <div style="text-align: center; margin: 40px 0;">
      <a href="${appUrl}/orgs" style="display: inline-block; background: #667eea; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
        Перейти в Orbo
      </a>
    </div>
    
    <p style="font-size: 14px; color: #6b7280; background: #f9fafb; padding: 15px; border-radius: 6px; margin-top: 30px;">
      💡 <strong>Совет:</strong> Если у вас есть Telegram-аккаунт, подключите его в настройках для синхронизации с Telegram-группами.
    </p>
  </div>
  
  <div style="text-align: center; margin-top: 30px; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 5px 0;">© 2025 Orbo. Все права защищены.</p>
    <p style="margin: 5px 0;">Платформа для управления сообществами</p>
  </div>
</body>
</html>
    `.trim()
  }
}

// Singleton instance
let emailServiceInstance: EmailService | null = null

export function getEmailService(): EmailService {
  if (!emailServiceInstance) {
    emailServiceInstance = new EmailService()
  }
  return emailServiceInstance
}

export { EmailService }

