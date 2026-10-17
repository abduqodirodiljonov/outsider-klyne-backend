// ─────────────────────────────────────────────
// Outsider klyne — Create Order handler
// ─────────────────────────────────────────────
// Основной серверный хэндлер для POST /api/orders.
// Шаги: валидация → запись в Supabase → Telegram + Email.
//
// Хэндлер не привязан к конкретному фреймворку.
// Принимает и возвращает простые объекты — подключай
// к Express, Fastify, Next.js API Routes или Supabase Edge Functions.

import { getSupabaseAdmin } from '../lib/supabase';
import {
  sendTelegramOrderNotification,
  type TelegramOrderItem,
} from '../services/telegram';
import { sendEmailNotification } from '../services/email';
import type { OrderPayload, Order } from '../types';

/* ── Типы ответа хэндлера ────────────────────── */

export interface HandlerResponse {
  status: number;
  body: Record<string, unknown>;
}

/* ── Валидация ───────────────────────────────── */

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function validateOrderPayload(data: unknown): ValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Тело запроса должно быть JSON-объектом'] };
  }

  const payload = data as Record<string, unknown>;

  // Обязательные поля
  if (!payload.name || typeof payload.name !== 'string' || payload.name.trim().length === 0) {
    errors.push('Поле "name" обязательно и должно быть непустой строкой');
  }

  if (!payload.phone || typeof payload.phone !== 'string' || payload.phone.trim().length === 0) {
    errors.push('Поле "phone" обязательно и должно быть непустой строкой');
  }

  // Необязательные, но с проверкой типов
  if (payload.email !== undefined && typeof payload.email !== 'string') {
    errors.push('Поле "email" должно быть строкой');
  }

  if (payload.deliveryAddress !== undefined && typeof payload.deliveryAddress !== 'string') {
    errors.push('Поле "deliveryAddress" должно быть строкой');
  }

  const validContactMethods = ['Phone', 'Telegram', 'WhatsApp'];
  if (payload.contactMethod !== undefined && !validContactMethods.includes(payload.contactMethod as string)) {
    errors.push('Поле "contactMethod" должно быть одним из: Phone, Telegram, WhatsApp');
  }

  const validCurrencies = ['UZS', 'RUB', 'USD', 'KZT'];
  if (payload.currency !== undefined && !validCurrencies.includes(payload.currency as string)) {
    errors.push('Поле "currency" должно быть одним из: UZS, RUB, USD, KZT');
  }

  if (payload.comment !== undefined && typeof payload.comment !== 'string') {
    errors.push('Поле "comment" должно быть строкой');
  }

  if (payload.totalAmount !== undefined && (typeof payload.totalAmount !== 'number' || payload.totalAmount < 0)) {
    errors.push('Поле "totalAmount" должно быть неотрицательным числом');
  }

  if (payload.items !== undefined) {
    if (!Array.isArray(payload.items)) {
      errors.push('Поле "items" должно быть массивом');
    } else {
      payload.items.forEach((item: unknown, index: number) => {
        if (!item || typeof item !== 'object') {
          errors.push(`items[${index}]: должен быть объектом`);
          return;
        }
        const orderItem = item as Record<string, unknown>;
        if (!orderItem.product_id || typeof orderItem.product_id !== 'string') {
          errors.push(`items[${index}].product_id: обязателен (строка)`);
        }
        if (orderItem.title !== undefined && typeof orderItem.title !== 'string') {
          errors.push(`items[${index}].title: должно быть строкой`);
        }
        if (!orderItem.size || typeof orderItem.size !== 'string') {
          errors.push(`items[${index}].size: обязателен (строка)`);
        }
        if (!orderItem.color || typeof orderItem.color !== 'string') {
          errors.push(`items[${index}].color: обязателен (строка)`);
        }
        if (typeof orderItem.quantity !== 'number' || orderItem.quantity < 1) {
          errors.push(`items[${index}].quantity: обязателен (число >= 1)`);
        }
        if (orderItem.price !== undefined && (typeof orderItem.price !== 'number' || orderItem.price < 0)) {
          errors.push(`items[${index}].price: должно быть неотрицательным числом`);
        }
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

/* ── Основной хэндлер ────────────────────────── */

/**
 * Обрабатывает POST-запрос на создание заказа.
 */
export async function handleCreateOrder(body: unknown): Promise<HandlerResponse> {
  // ── Шаг 1: Валидация ──────────────────────────
  const validation = validateOrderPayload(body);

  if (!validation.valid) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'Ошибка валидации',
        details: validation.errors,
      },
    };
  }

  const payload = body as OrderPayload;

  try {
    // ── Шаг 2: Сохранение в Supabase ──────────────
    const supabase = getSupabaseAdmin();

    // Сохраняем адрес доставки, способ связи и валюту в комментарии
    const combinedComment = [
      payload.deliveryAddress ? `Адрес доставки: ${payload.deliveryAddress.trim()}` : null,
      payload.contactMethod ? `Способ связи: ${payload.contactMethod}` : null,
      payload.currency ? `Валюта: ${payload.currency}` : null,
      payload.comment?.trim() || null,
    ]
      .filter(Boolean)
      .join('\n\n') || null;

    const { data: order, error: dbError } = await supabase
      .from('orders')
      .insert({
        name:    payload.name.trim(),
        phone:   payload.phone.trim(),
        email:   payload.email?.trim() ?? '',
        comment: combinedComment,
        items:   payload.items ?? null,
        status:  'new',
      })
      .select()
      .single<Order>();

    if (dbError || !order) {
      console.error('[Supabase] Ошибка записи заказа:', dbError);
      return {
        status: 500,
        body: {
          success: false,
          error: 'Не удалось сохранить заказ. Попробуйте позже.',
        },
      };
    }

    console.log(`[Order] Создан заказ ${order.id}`);

    // ── Шаг 3: Подготовка данных для Telegram ──────
    const telegramItems: TelegramOrderItem[] = (payload.items || []).map((item) => ({
      title: item.title || `Товар (${item.product_id})`,
      quantity: item.quantity,
      size: item.size,
      color: item.color,
      price: item.price ?? 0,
    }));

    const totalAmount =
      payload.totalAmount ??
      telegramItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

    // ── Шаг 4: Уведомления (параллельно) ─────────
    // Сбои Telegram или Email не ломают создание заказа — заказ уже в БД
    const [telegramOk, emailOk] = await Promise.allSettled([
      sendTelegramOrderNotification({
        orderId: order.id,
        customerName: payload.name.trim(),
        phone: payload.phone.trim(),
        contactMethod: payload.contactMethod,
        currency: payload.currency,
        deliveryAddress: payload.deliveryAddress?.trim(),
        items: telegramItems,
        totalAmount,
        comment: payload.comment?.trim(),
      }),
      sendEmailNotification(payload, order.id),
    ]);

    const notifications = {
      telegram: telegramOk.status === 'fulfilled' && telegramOk.value,
      email:    emailOk.status === 'fulfilled' && emailOk.value,
    };

    // ── Шаг 4: Ответ клиенту ─────────────────────
    return {
      status: 201,
      body: {
        success: true,
        order: {
          id:         order.id,
          status:     order.status,
          created_at: order.created_at,
        },
        notifications,
      },
    };
  } catch (err) {
    console.error('[Order] Непредвиденная ошибка:', err);
    return {
      status: 500,
      body: {
        success: false,
        error: 'Внутренняя ошибка сервера',
      },
    };
  }
}
