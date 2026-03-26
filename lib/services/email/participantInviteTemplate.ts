/**
 * Branded email template for participant invitations.
 * Uses org customization: logo_url, portal_cover_url, public_description, name.
 */

interface OrgBranding {
  name: string
  logo_url?: string | null
  portal_cover_url?: string | null
  public_description?: string | null
}

interface InviteEmailData {
  org: OrgBranding
  inviteLink: string
  invitedByName?: string
  personalNote?: string
}

interface MagicLinkEmailData {
  org: OrgBranding
  magicLink: string
}

export function buildParticipantInviteEmail(data: InviteEmailData): { subject: string; html: string } {
  const { org, inviteLink, invitedByName, personalNote } = data
  const subject = `Вас приглашают в ${org.name}`

  const coverSection = org.portal_cover_url
    ? `<img src="${org.portal_cover_url}" alt="${org.name}" style="width:100%;max-height:200px;object-fit:cover;display:block;border-radius:10px 10px 0 0;" />`
    : `<div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);height:8px;border-radius:10px 10px 0 0;"></div>`

  const logoSection = org.logo_url
    ? `<img src="${org.logo_url}" alt="${org.name}" style="width:56px;height:56px;border-radius:12px;object-fit:cover;margin-bottom:16px;border:2px solid #e5e7eb;" />`
    : ''

  const descSection = org.public_description
    ? `<p style="font-size:14px;color:#6b7280;margin-bottom:24px;line-height:1.6;">${org.public_description}</p>`
    : ''

  const noteSection = personalNote
    ? `<div style="background:#f0f4ff;border-left:3px solid #667eea;padding:12px 16px;border-radius:0 6px 6px 0;margin-bottom:24px;">
        <p style="font-size:14px;color:#374151;margin:0;font-style:italic;">"${personalNote}"</p>
       </div>`
    : ''

  const invitedBySection = invitedByName
    ? `<p style="font-size:15px;color:#374151;margin-bottom:16px;"><strong>${invitedByName}</strong> приглашает вас в сообщество <strong>${org.name}</strong>.</p>`
    : `<p style="font-size:15px;color:#374151;margin-bottom:16px;">Вас приглашают присоединиться к сообществу <strong>${org.name}</strong>.</p>`

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
    ${coverSection}
    <div style="padding:32px 30px;">
      ${logoSection}
      <h2 style="color:#1f2937;margin:0 0 16px;font-size:22px;">${org.name}</h2>
      ${invitedBySection}
      ${descSection}
      ${noteSection}
      <div style="text-align:center;margin:32px 0;">
        <a href="${inviteLink}" style="display:inline-block;background:#667eea;color:#fff;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;">
          Принять приглашение
        </a>
      </div>
      <p style="font-size:12px;color:#9ca3af;margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;">
        Если кнопка не работает, скопируйте ссылку:<br>
        <a href="${inviteLink}" style="color:#667eea;word-break:break-all;">${inviteLink}</a>
      </p>
      <p style="font-size:12px;color:#9ca3af;margin-top:8px;">
        Ссылка действительна 7 дней.
      </p>
    </div>
  </div>
  <div style="text-align:center;margin-top:24px;color:#9ca3af;font-size:12px;">
    <p style="margin:4px 0;">Письмо отправлено через платформу Orbo</p>
  </div>
</body>
</html>`

  return { subject, html }
}

export function buildParticipantMagicLinkEmail(data: MagicLinkEmailData): { subject: string; html: string } {
  const { org, magicLink } = data
  const subject = `Ссылка для входа в ${org.name}`

  const logoSection = org.logo_url
    ? `<img src="${org.logo_url}" alt="${org.name}" style="width:48px;height:48px;border-radius:10px;object-fit:cover;margin-bottom:12px;border:1px solid #e5e7eb;" />`
    : ''

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);height:6px;"></div>
    <div style="padding:32px 30px;">
      ${logoSection}
      <h2 style="color:#1f2937;margin:0 0 8px;font-size:20px;">${org.name}</h2>
      <p style="font-size:15px;color:#374151;margin-bottom:24px;">
        Нажмите кнопку ниже, чтобы войти в сообщество. Ссылка одноразовая.
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${magicLink}" style="display:inline-block;background:#667eea;color:#fff;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;">
          Войти
        </a>
      </div>
      <p style="font-size:12px;color:#9ca3af;margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;">
        Если кнопка не работает:<br>
        <a href="${magicLink}" style="color:#667eea;word-break:break-all;">${magicLink}</a>
      </p>
      <p style="font-size:12px;color:#9ca3af;margin-top:8px;">
        Ссылка действительна 30 минут. Если вы не запрашивали вход — проигнорируйте это письмо.
      </p>
    </div>
  </div>
  <div style="text-align:center;margin-top:24px;color:#9ca3af;font-size:12px;">
    <p style="margin:4px 0;">Письмо отправлено через платформу Orbo</p>
  </div>
</body>
</html>`

  return { subject, html }
}
