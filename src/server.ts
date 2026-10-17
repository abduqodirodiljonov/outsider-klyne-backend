// ─────────────────────────────────────────────
// Outsider klyne — HTTP Server
// ─────────────────────────────────────────────
// Сервер для обработки заказов с фронтенда.
// Запуск: npm run dev или npm start

import http from 'node:http';
import { getEnv } from './lib/env';
import { handleCreateOrder } from './handlers/createOrder';

import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
} from './services/productService';
import type { ProductCategory, Size } from './types';

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey, Prefer, x-client-info');
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
    // ── 1. Root & Health check ───────────────────────
    if (req.method === 'GET' && (pathname === '/' || pathname === '/health')) {
      sendJson(res, 200, {
        status: 'ok',
        service: 'outsider-klyne-backend',
        message: 'Outsider klyne API is running',
        endpoints: {
          health: 'GET /health',
          createOrder: 'POST /api/orders',
        },
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

    // ── 3. Получение списка товаров (GET /api/products) ─
    if (req.method === 'GET' && pathname === '/api/products') {
      const category = parsedUrl.searchParams.get('category') as ProductCategory | null;
      const sort = parsedUrl.searchParams.get('sort') as any;
      const limit = Number(parsedUrl.searchParams.get('limit')) || 50;
      const offset = Number(parsedUrl.searchParams.get('offset')) || 0;

      const result = await getProducts({
        category: category || undefined,
        sort: sort || undefined,
        limit,
        offset,
      });

      sendJson(res, 200, {
        success: true,
        ...result,
      });
      return;
    }

    // ── 4. Получение одного товара (GET /api/products/:id)
    const productMatch = pathname.match(/^\/api\/products\/([a-zA-Z0-9_-]+)$/);
    if (req.method === 'GET' && productMatch) {
      const productId = productMatch[1];
      const product = await getProductById(productId);
      if (!product) {
        sendJson(res, 404, { success: false, error: 'Товар не найден' });
        return;
      }
      sendJson(res, 200, { success: true, product });
      return;
    }

    // ── 5. Создание товара (POST /api/products) ────────
    if (req.method === 'POST' && pathname === '/api/products') {
      const rawBody = await readRequestBody(req);
      let payload: any;
      try {
        payload = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        sendJson(res, 400, { success: false, error: 'Некорректный JSON' });
        return;
      }

      const cleanInput = {
        title: String(payload.title || '').trim(),
        price: Number(payload.price) || 0,
        category: payload.category || 'tops',
        sizes: Array.isArray(payload.sizes)
          ? payload.sizes
          : typeof payload.sizes === 'string'
            ? payload.sizes.split(',').map((s: string) => s.trim()).filter(Boolean)
            : ['M', 'L'],
        colors: Array.isArray(payload.colors)
          ? payload.colors
          : typeof payload.colors === 'string'
            ? payload.colors.split(',').map((s: string) => s.trim()).filter(Boolean)
            : ['Black'],
        images: Array.isArray(payload.images)
          ? payload.images
          : payload.images
            ? [String(payload.images)]
            : [],
        description: String(payload.description || '').trim(),
      };

      const product = await createProduct(cleanInput);
      sendJson(res, 201, { success: true, product });
      return;
    }

    // ── 6. Обновление товара (PUT / PATCH /api/products/:id или /api/products)
    if ((req.method === 'PUT' || req.method === 'PATCH') && (pathname === '/api/products' || productMatch)) {
      const rawBody = await readRequestBody(req);
      let payload: any;
      try {
        payload = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        sendJson(res, 400, { success: false, error: 'Некорректный JSON' });
        return;
      }

      const productId = productMatch ? productMatch[1] : (parsedUrl.searchParams.get('id') || payload.id);
      if (!productId) {
        sendJson(res, 400, { success: false, error: 'Не указан ID товара' });
        return;
      }

      // Санитизация полей перед записью в Supabase
      const updateData: Record<string, unknown> = {};
      if (payload.title !== undefined) updateData.title = String(payload.title).trim();
      if (payload.price !== undefined) updateData.price = Number(payload.price);
      if (payload.category !== undefined) updateData.category = payload.category;
      if (payload.sizes !== undefined) {
        updateData.sizes = Array.isArray(payload.sizes)
          ? payload.sizes
          : String(payload.sizes).split(',').map((s: string) => s.trim()).filter(Boolean);
      }
      if (payload.colors !== undefined) {
        updateData.colors = Array.isArray(payload.colors)
          ? payload.colors
          : String(payload.colors).split(',').map((s: string) => s.trim()).filter(Boolean);
      }
      if (payload.images !== undefined) {
        updateData.images = Array.isArray(payload.images)
          ? payload.images
          : [String(payload.images)];
      }
      if (payload.description !== undefined) updateData.description = String(payload.description).trim();

      const updated = await updateProduct(productId, updateData);
      sendJson(res, 200, { success: true, product: updated });
      return;
    }

    // ── 7. Удаление товара (DELETE /api/products/:id) ──
    if (req.method === 'DELETE' && productMatch) {
      const productId = productMatch[1];
      await deleteProduct(productId);
      sendJson(res, 200, { success: true, message: 'Товар успешно удален' });
      return;
    }

    // ── 8. Маршрут не найден (404) ───────────────────
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
