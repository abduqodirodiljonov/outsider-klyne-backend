// ─────────────────────────────────────────────
// Outsider klyne — Email notification service (Resend)
// ─────────────────────────────────────────────

import { getEnv } from '../lib/env';
import type { OrderPayload } from '../types';

const RESEND_API = 'https://api.resend.com/emails';

/**
 * Генерирует HTML-письмо для администратора.
 * Стилизация inline — для максимальной совместимости с почтовыми клиентами.
 */
function buildEmailHtml(order: OrderPayload, orderId: string): string {
  const itemsSection = order.items?.length
    ? `
      <h3 style="margin:24px 0 12px;color:#1a1a2e;">🛒 Позиции заказа</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#f0f0f5;">
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #ddd;">Товар ID</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #ddd;">Размер</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #ddd;">Цвет</th>
            <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #ddd;">Кол-во</th>
          </tr>
        </thead>
        <tbody>
          ${order.items!.map((item, i) => `
            <tr style="background:${i % 2 === 0 ? '#fff' : '#fafafa'};">
              <td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px;">${item.product_id}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;">${item.size}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;">${item.color}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`
    : '';

  return `
<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5fa;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:32px 24px;text-align:center;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:600;letter-spacing:0.5px;">
        📦 Новый заказ — Outsider klyne
      </h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.7);font-size:13px;">Демо-версия</p>
    </div>

    <!-- Body -->
    <div style="padding:24px;">
      <h3 style="margin:0 0 16px;color:#1a1a2e;">👤 Данные покупателя</h3>
      
      <table style="width:100%;font-size:14px;line-height:1.6;">
        <tr>
          <td style="padding:4px 0;color:#666;width:120px;">Имя</td>
          <td style="padding:4px 0;font-weight:600;">${escHtml(order.name)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#666;">Телефон</td>
          <td style="padding:4px 0;font-weight:600;">${escHtml(order.phone)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#666;">Email</td>
          <td style="padding:4px 0;font-weight:600;">${escHtml(order.email || 'Не указан')}</td>
        </tr>
        ${order.deliveryAddress ? `
        <tr>
          <td style="padding:4px 0;color:#666;">Адрес доставки</td>
          <td style="padding:4px 0;">${escHtml(order.deliveryAddress)}</td>
        </tr>` : ''}
        ${order.comment ? `
        <tr>
          <td style="padding:4px 0;color:#666;">Комментарий</td>
          <td style="padding:4px 0;">${escHtml(order.comment)}</td>
        </tr>` : ''}
      </table>

      ${itemsSection}

      <!-- Footer info -->
      <div style="margin-top:24px;padding:16px;background:#f8f8fc;border-radius:8px;font-size:13px;color:#666;">
        <strong>ID заказа:</strong> <code style="background:#eee;padding:2px 6px;border-radius:4px;">${orderId}</code><br>
        <strong>Время:</strong> ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' })} (Ташкент)
      </div>
    </div>

    <!-- Brand footer -->
    <div style="padding:16px 24px;background:#fafafa;text-align:center;font-size:12px;color:#999;border-top:1px solid #eee;">
      Outsider klyne — Demo Backend Notification
    </div>
  </div>
</body>
</html>`;
}

/** Экранирование HTML-спецсимволов */
function escHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Отправляет email-уведомление администратору через Resend API.
 * Возвращает `true` при успехе, `false` при ошибке (не бросает исключение).
 */
export async function sendEmailNotification(
  order: OrderPayload,
  orderId: string,
): Promise<boolean> {
  const env = getEnv();

  try {
    const response = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: env.FROM_EMAIL,
        to: [env.ADMIN_EMAIL],
        subject: `📦 Новый заказ | Outsider klyne (Демо) — ${order.name}`,
        html: buildEmailHtml(order, orderId),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error('[Resend] Ошибка отправки:', response.status, body);
      return false;
    }

    console.log('[Resend] Email-уведомление отправлено ✓');
    return true;
  } catch (err) {
    console.error('[Resend] Сетевая ошибка:', err);
    return false;
  }
}
