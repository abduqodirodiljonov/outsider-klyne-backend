// ─────────────────────────────────────────────
// Outsider klyne — HTTP Server
// ─────────────────────────────────────────────
// Сервер для обработки заказов с фронтенда.
// Запуск: npm run dev или npm start

import http from 'node:http';
import { getEnv } from './lib/env';
import { handleCreateOrder } from './handlers/createOrder';

// Валидируем наличие всех переменных окружения
getEnv();

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

/**
 * Читает тело входящего HTTP-запроса как строку.
 */
function readRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      // Защита от слишком больших тел запросов (лимит 1MB)
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload Too Large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

/**
 * Устанавливает стандартные CORS-заголовки.
 */
function setCorsHeaders(res: http.ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * Отправляет JSON-ответ.
 */
function sendJson(res: http.ServerResponse, statusCode: number, data: unknown): void {
  setCorsHeaders(res);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.statusCode = statusCode;
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  // Preflight CORS-запросы от браузера
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  try {
    // ── 1. Health check ──────────────────────────────
    if (req.method === 'GET' && pathname === '/health') {
      sendJson(res, 200, {
        status: 'ok',
        service: 'outsider-klyne-backend',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // ── 2. Оформление заказа ─────────────────────────
    if (req.method === 'POST' && pathname === '/api/orders') {
      const rawBody = await readRequestBody(req);
      let parsedBody: unknown;

      try {
        parsedBody = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        sendJson(res, 400, {
          success: false,
          error: 'Некорректный JSON в теле запроса',
        });
        return;
      }

      const result = await handleCreateOrder(parsedBody);
      sendJson(res, result.status, result.body);
      return;
    }

    // ── 3. Маршрут не найден (404) ───────────────────
    sendJson(res, 404, {
      success: false,
      error: `Маршрут ${req.method} ${pathname} не найден`,
    });
  } catch (error) {
    console.error('[Server Error]', error);
    sendJson(res, 500, {
      success: false,
      error: 'Внутренняя ошибка сервера',
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`
╔════════════════════════════════════════════════════════════════════╗
║             ⚡ OUTSIDER KLYNE — BACKEND SERVER                    ║
╠════════════════════════════════════════════════════════════════════╣
║  URL:     http://localhost:${PORT}                                    ║
║  Health:  http://localhost:${PORT}/health                             ║
║  Orders:  POST http://localhost:${PORT}/api/orders                    ║
║  Status:  READY FOR FRONTEND CONNECTION                           ║
╚════════════════════════════════════════════════════════════════════╝
`);
});

// Корректное завершение при сигналах остановки
function shutdown() {
  console.log('\nОстановка сервера...');
  server.close(() => {
    console.log('Сервер остановлен.');
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
