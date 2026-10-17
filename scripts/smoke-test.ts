// ─────────────────────────────────────────────
// Outsider klyne — Smoke test
// ─────────────────────────────────────────────
// Быстрая проверка бэкенда через API.
// Запуск: npx tsx scripts/smoke-test.ts
//
// Переменные окружения:
//   API_URL            — URL бэкенда (по умолчанию http://localhost:3000)
//   SUPABASE_URL       — URL Supabase-проекта (опционально)
//   SUPABASE_ANON_KEY  — anon key Supabase (опционально)

const API_URL = process.env.API_URL || 'http://localhost:3000';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function log(icon: string, msg: string) {
  console.log(`${icon}  ${msg}`);
}

async function testHealth(): Promise<void> {
  log('1️⃣', 'Health check...');
  try {
    const res = await fetch(`${API_URL}/health`);
    const passed = res.ok;
    const body = await res.json();
    results.push({ name: 'Health', passed, details: `Status ${res.status}, body: ${JSON.stringify(body)}` });
    log(passed ? '✅' : '❌', `Status: ${res.status}`);
  } catch (err) {
    results.push({ name: 'Health', passed: false, details: String(err) });
    log('❌', `Сервер недоступен: ${err}`);
  }
}

async function testValidOrder(): Promise<void> {
  log('2️⃣', 'Создание тестового заказа...');
  try {
    const res = await fetch(`${API_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Smoke Test',
        phone: '+7 000 000-00-00',
        email: 'smoke@test.local',
        comment: `Автоматический smoke-тест — ${new Date().toISOString()}`,
      }),
    });

    const body = await res.json();
    const passed = res.status === 201 && body.success === true;

    results.push({ name: 'Create Order', passed, details: JSON.stringify(body) });
    log(passed ? '✅' : '❌', `Status: ${res.status}`);

    if (body.order?.id) log('🆔', `Order ID: ${body.order.id}`);
    if (body.notifications) {
      log(body.notifications.telegram ? '✅' : '⚠️', `Telegram: ${body.notifications.telegram ? 'отправлено' : 'не отправлено'}`);
      log(body.notifications.email ? '✅' : '⚠️', `Email: ${body.notifications.email ? 'отправлено' : 'не отправлено'}`);
    }
  } catch (err) {
    results.push({ name: 'Create Order', passed: false, details: String(err) });
    log('❌', `Ошибка: ${err}`);
  }
}

async function testValidation(): Promise<void> {
  log('3️⃣', 'Тест валидации (без phone)...');
  try {
    const res = await fetch(`${API_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Only Name' }),
    });

    const passed = res.status === 400;
    const body = await res.json();

    results.push({ name: 'Validation', passed, details: JSON.stringify(body) });
    log(passed ? '✅' : '❌', `Status: ${res.status} ${passed ? '(ожидаемо 400)' : '(ожидали 400!)'}`);
  } catch (err) {
    results.push({ name: 'Validation', passed: false, details: String(err) });
    log('❌', `Ошибка: ${err}`);
  }
}

async function testProductsRead(): Promise<void> {
  log('4️⃣', 'Чтение таблицы products...');

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    log('⏭️', 'Пропущено (нет SUPABASE_URL / SUPABASE_ANON_KEY)');
    results.push({ name: 'Products Read', passed: true, details: 'Skipped — no env vars' });
    return;
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/products?select=id,title,price&limit=5`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      },
    );

    const products = await res.json();
    const passed = res.ok && Array.isArray(products);

    results.push({ name: 'Products Read', passed, details: `${Array.isArray(products) ? products.length : 0} products` });
    log(passed ? '✅' : '❌', `Найдено товаров: ${Array.isArray(products) ? products.length : 'ошибка'}`);

    if (Array.isArray(products)) {
      products.forEach((p: { title: string; price: number }) => {
        log('  📦', `${p.title} — ${new Intl.NumberFormat('ru-RU').format(p.price)} UZS`);
      });
    }
  } catch (err) {
    results.push({ name: 'Products Read', passed: false, details: String(err) });
    log('❌', `Ошибка: ${err}`);
  }
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('🔥 Smoke Test — Outsider klyne Backend');
  console.log(`   Target: ${API_URL}`);
  console.log('═══════════════════════════════════════\n');

  await testHealth();
  console.log();
  await testValidOrder();
  console.log();
  await testValidation();
  console.log();
  await testProductsRead();

  // Summary
  console.log('\n═══════════════════════════════════════');
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log(`📊 Результат: ${passed}/${total} тестов пройдено`);

  if (passed === total) {
    console.log('✨ Все тесты пройдены — бэкенд готов!');
  } else {
    console.log('⚠️  Есть проблемы — проверь детали выше');
    process.exitCode = 1;
  }
  console.log('═══════════════════════════════════════');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exitCode = 1;
});
