// ─────────────────────────────────────────────
// Outsider klyne — Telegram notification service
// ─────────────────────────────────────────────
// Отправка структурированных уведомлений о заказах через Telegram Bot API.

import 'dotenv/config';
import type { Currency, ContactMethod } from '../types';

export type { Currency, ContactMethod };

/* ── Типы данных ─────────────────────────────── */

export interface TelegramOrderItem {
  /** Название товара (например, "Худи Oversize Outsider") */
  title: string;
  /** Количество единиц */
  quantity: number;
  /** Выбранный размер (например, "M", "L", "ONESIZE") */
  size: string;
  /** Выбранный цвет (например, "Черный графит", "Молочный") */
  color: string;
  /** Цена за единицу товара в выбранной валюте */
  price: number;
}

export interface TelegramOrderData {
  /** Уникальный идентификатор заказа (UUID или короткий номер) */
  orderId: string;
  /** Имя покупателя */
  customerName: string;
  /** Контактный телефон */
  phone: string;
  /** Предпочтительный способ связи */
  contactMethod?: ContactMethod;
  /** Выбранная валюта заказа */
  currency?: Currency;
  /** Адрес доставки (опционально) */
  deliveryAddress?: string;
  /** Список заказанных позиций */
  items: TelegramOrderItem[];
  /** Итоговая стоимость заказа */
  totalAmount: number;
  /** Комментарий покупателя к заказу */
  comment?: string;
}

interface TelegramSendMessagePayload {
  chat_id: string;
  text: string;
  parse_mode: 'HTML';
  disable_web_page_preview?: boolean;
}

interface TelegramApiResponse {
  ok: boolean;
  error_code?: number;
  description?: string;
}

/* ── Константы и конфигурация ────────────────── */

const DEFAULT_BOT_TOKEN = '8970016372:AAHV2NKCZEdUOf06Jp_IchYgD3orwHjzF5A';
const DEFAULT_CHAT_ID = '2111212753';
const TELEGRAM_API_BASE = 'https://api.telegram.org';

function getBotToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN || DEFAULT_BOT_TOKEN;
}

function getChatId(): string {
  return process.env.TELEGRAM_CHAT_ID || DEFAULT_CHAT_ID;
}

/* ── Вспомогательные функции ─────────────────── */

/**
 * Безопасное экранирование специальных HTML-символов
 * для предотвращения ошибок парсинга Telegram API.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Форматирование суммы с учетом выбранной валюты:
 * - UZS: 150 000 сум
 * - RUB: 1 200 ₽
 * - USD: $15
 * - KZT: 7 500 ₸
 */
export function formatCurrency(amount: number, currency: Currency = 'UZS'): string {
  const rounded = Math.round(amount);
  const formattedNumber = new Intl.NumberFormat('ru-RU').format(rounded);

  switch (currency) {
    case 'USD':
      return `$${formattedNumber}`;
    case 'RUB':
      return `${formattedNumber} ₽`;
    case 'KZT':
      return `${formattedNumber} ₸`;
    case 'UZS':
    default:
      return `${formattedNumber} сум`;
  }
}

/**
 * Формирует человекочитаемое название способа связи с эмодзи.
 */
function formatContactMethod(method?: ContactMethod): string {
  switch (method) {
    case 'Telegram':
      return '✈️ Telegram';
    case 'WhatsApp':
      return '💬 WhatsApp';
    case 'Phone':
    default:
      return '📞 Телефонный звонок';
  }
}

/**
 * Формирует эстетичное HTML-сообщение для Telegram.
 */
function buildOrderHtmlMessage(order: TelegramOrderData): string {
  const currency: Currency = order.currency || 'UZS';
  const safeId = escapeHtml(order.orderId);
  const safeName = escapeHtml(order.customerName);
  const safePhone = escapeHtml(order.phone);
  const safeAddress = order.deliveryAddress ? escapeHtml(order.deliveryAddress) : 'Не указан / Самовывоз';
  const contactText = formatContactMethod(order.contactMethod);
  const totalFormatted = formatCurrency(order.totalAmount, currency);

  const lines: string[] = [
    '🛍 <b>НОВЫЙ ЗАКАЗ | Outsider klyne</b>',
    '━━━━━━━━━━━━━━━━━━━━',
    `🆔 <b>ID заказа:</b> <code>${safeId}</code>`,
    `👤 <b>Клиент:</b> ${safeName}`,
    `📞 <b>Телефон:</b> <code>${safePhone}</code>`,
    `📲 <b>Способ связи:</b> <b>${escapeHtml(contactText)}</b>`,
    `📍 <b>Адрес доставки:</b> ${safeAddress}`,
    `💱 <b>Валюта заказа:</b> <code>${currency}</code>`,
  ];

  if (order.comment && order.comment.trim().length > 0) {
    lines.push(`💬 <b>Комментарий:</b> <i>${escapeHtml(order.comment.trim())}</i>`);
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━');
  lines.push('📦 <b>Состав заказа:</b>');

  if (order.items.length === 0) {
    lines.push('<i>(Список товаров пуст или уточняется менеджером)</i>');
  } else {
    order.items.forEach((item, index) => {
      const safeTitle = escapeHtml(item.title);
      const safeSize = escapeHtml(item.size);
      const safeColor = escapeHtml(item.color);
      const itemSubtotal = formatCurrency(item.price * item.quantity, currency);
      const itemPrice = formatCurrency(item.price, currency);

      lines.push(
        `${index + 1}. <b>${safeTitle}</b>\n` +
        `   • Размер: <code>${safeSize}</code> | Цвет: <code>${safeColor}</code>\n` +
        `   • ${item.quantity} шт. × ${itemPrice} = <b>${itemSubtotal}</b>`
      );
    });
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━');
  lines.push(`💰 <b>ИТОГО К ОПЛАТЕ:</b> <b>${totalFormatted}</b>`);
  lines.push(`⏱ <i>Время заказа: ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' })} (Ташкент)</i>`);

  return lines.join('\n');
}

/* ── Основная функция отправки ───────────────── */

/**
 * Отправляет уведомление о новом заказе в Telegram-канал/чат бренда.
 *
 * Безопасна для вызывающего кода: оборачивает вызов в try/catch,
 * логирует детали в консоль и возвращает boolean-статус доставки.
 *
 * @param orderData Данные сформированного заказа
 * @returns `true`, если сообщение доставлено, `false` при ошибке
 */
export async function sendTelegramOrderNotification(
  orderData: TelegramOrderData,
): Promise<boolean> {
  const token = getBotToken();
  const chatId = getChatId();
  const endpoint = `${TELEGRAM_API_BASE}/bot${token}/sendMessage`;

  const payload: TelegramSendMessagePayload = {
    chat_id: chatId,
    text: buildOrderHtmlMessage(orderData),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = (await response.json()) as TelegramApiResponse;

    if (!response.ok || !result.ok) {
      console.error(
        `[Telegram] ❌ Ошибка отправки (HTTP ${response.status}):`,
        result.description || 'Неизвестная ошибка Telegram API'
      );
      return false;
    }

    console.log(`[Telegram] ✅ Уведомление о заказе #${orderData.orderId} успешно доставлено (${orderData.currency || 'UZS'})`);
    return true;
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[Telegram] ❌ Сетевой сбой при обращении к Telegram API:', errorMessage);
    return false;
  }
}

/**
 * Совместимость с предыдущим вызовом sendTelegramNotification.
 */
export const sendTelegramNotification = async (
  order: {
    name: string;
    phone: string;
    contactMethod?: ContactMethod;
    currency?: Currency;
    comment?: string;
    deliveryAddress?: string;
    items?: Array<{
      product_id: string;
      title?: string;
      size: string;
      color: string;
      quantity: number;
      price?: number;
    }>;
    totalAmount?: number;
  },
  orderId: string,
): Promise<boolean> => {
  const items: TelegramOrderItem[] = (order.items || []).map((item) => ({
    title: item.title || `Товар (${item.product_id})`,
    quantity: item.quantity,
    size: item.size,
    color: item.color,
    price: item.price ?? 0,
  }));

  const calculatedTotal =
    order.totalAmount ??
    items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return sendTelegramOrderNotification({
    orderId,
    customerName: order.name,
    phone: order.phone,
    contactMethod: order.contactMethod,
    currency: order.currency,
    deliveryAddress: order.deliveryAddress,
    items,
    totalAmount: calculatedTotal,
    comment: order.comment,
  });
};
