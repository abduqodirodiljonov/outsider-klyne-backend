// ─────────────────────────────────────────────
// Outsider klyne — Test Telegram Notifications
// ─────────────────────────────────────────────
// Запуск: npx tsx src/test-telegram.ts

import { sendTelegramOrderNotification, formatCurrency } from './services/telegram';
import type { TelegramOrderData } from './services/telegram';

async function runTelegramTests() {
  console.log('🚀 Запуск тестирования Telegram-уведомлений Outsider klyne...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Тест 1: Заказ в UZS (Узбекистан, связь через Telegram)
  const uzsOrder: TelegramOrderData = {
    orderId: 'UZS-' + Math.floor(100000 + Math.random() * 900000),
    customerName: 'Сардор Алимов',
    phone: '+998 (90) 987-65-43',
    contactMethod: 'Telegram',
    currency: 'UZS',
    deliveryAddress: 'г. Ташкент, Яккасарайский р-н, ул. Шота Руставели, д. 32',
    comment: 'Напишите в Telegram перед выездом курьера',
    items: [
      {
        title: 'Худи Oversize Outsider "Dark Noir"',
        quantity: 1,
        size: 'L',
        color: 'Черный графит',
        price: 650000,
      },
      {
        title: 'Футболка Boxy Heavyweight',
        quantity: 2,
        size: 'XL',
        color: 'Молочный',
        price: 280000,
      },
    ],
    totalAmount: 1210000,
  };

  console.log(`\n1️⃣ Отправка заказа в UZS (Связь: ${uzsOrder.contactMethod}, Итого: ${formatCurrency(uzsOrder.totalAmount, 'UZS')})...`);
  const uzsResult = await sendTelegramOrderNotification(uzsOrder);
  console.log(`Результат UZS: ${uzsResult ? '✅ УСПЕШНО' : '❌ ОШИБКА'}`);

  // Небольшая задержка перед следующим сообщением
  await new Promise((resolve) => setTimeout(resolve, 1200));

  // Тест 2: Международный заказ в USD (связь через WhatsApp)
  const usdOrder: TelegramOrderData = {
    orderId: 'USD-' + Math.floor(100000 + Math.random() * 900000),
    customerName: 'Alexandre Laurent',
    phone: '+1 (555) 234-5678',
    contactMethod: 'WhatsApp',
    currency: 'USD',
    deliveryAddress: 'Dubai Marina, Silver Tower, Apt 1402',
    comment: 'Please text via WhatsApp for gate entry code',
    items: [
      {
        title: 'Bomber Jacket "Outsider Horizon"',
        quantity: 1,
        size: 'XL',
        color: 'Midnight Black',
        price: 120,
      },
      {
        title: 'Cargo Pants Utility',
        quantity: 1,
        size: 'L',
        color: 'Olive Drab',
        price: 85,
      },
    ],
    totalAmount: 205,
  };

  console.log(`\n2️⃣ Отправка заказа в USD (Связь: ${usdOrder.contactMethod}, Итого: ${formatCurrency(usdOrder.totalAmount, 'USD')})...`);
  const usdResult = await sendTelegramOrderNotification(usdOrder);
  console.log(`Результат USD: ${usdResult ? '✅ УСПЕШНО' : '❌ ОШИБКА'}`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (uzsResult && usdResult) {
    console.log('🎉 Все тесты мультивалютных уведомлений успешно пройдены!');
  } else {
    console.error('⚠️ Один или несколько тестов завершились с ошибкой.');
  }
}

runTelegramTests().catch((err) => {
  console.error('Фатальная ошибка при запуске тестов:', err);
  process.exit(1);
});
