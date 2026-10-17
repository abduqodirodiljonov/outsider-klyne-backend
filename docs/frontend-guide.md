# 📖 Outsider klyne — Руководство для фронтендера

> Техническая документация по работе с товарами: загрузка изображений, CRUD-операции, шаблон React-компонента.

---

## 📁 Структура проекта (бэкенд)

```
src/
├── types.ts                         ← Общие TypeScript-интерфейсы
├── lib/
│   ├── env.ts                       ← Конфигурация окружения
│   └── supabase.ts                  ← Supabase admin-клиент
├── services/
│   ├── productService.ts            ← CRUD + загрузка изображений
│   ├── telegram.ts                  ← Уведомления в Telegram
│   └── email.ts                     ← Email через Resend
└── handlers/
    └── createOrder.ts               ← Хэндлер заказов

docs/examples/
└── ProductForm.tsx                  ← Шаблон React-компонента формы
```

---

## 1. 🖼️ Загрузка изображений в Supabase Storage

### Предварительная настройка в Supabase Dashboard

1. Перейди в **Storage → New Bucket**
2. Создай бакет `products` с настройками:
   - **Public bucket**: ✅ (чтобы изображения были доступны без авторизации)
   - **File size limit**: 5 MB
   - **Allowed MIME types**: `image/jpeg, image/png, image/webp`

3. Добавь RLS-политику для бакета (SQL Editor):

```sql
-- Публичное чтение изображений товаров
CREATE POLICY "public_read_product_images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'products');

-- Загрузка для аутентифицированных пользователей
CREATE POLICY "auth_upload_product_images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'products');

-- Удаление для аутентифицированных
CREATE POLICY "auth_delete_product_images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'products');
```

### Код загрузки (фронтенд)

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

/**
 * Загружает файл в Supabase Storage.
 * @param file      — File из <input type="file">
 * @param productId — UUID товара (папка в бакете)
 * @returns публичный URL изображения
 */
async function uploadProductImage(file: File, productId: string): Promise<string> {
  // Уникальный путь: {productId}/{timestamp}_{safeName}
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${productId}/${timestamp}_${safeName}`;

  // 1. Загрузка
  const { error } = await supabase.storage
    .from('products')              // ← имя бакета
    .upload(path, file, {
      cacheControl: '3600',        // кэш 1 час
      upsert: false,               // не перезаписывать
      contentType: file.type,      // MIME-тип из файла
    });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  // 2. Получение публичного URL
  const { data } = supabase.storage
    .from('products')
    .getPublicUrl(path);

  return data.publicUrl;
  // → https://xyz.supabase.co/storage/v1/object/public/products/abc-123/1697...jacket.jpg
}
```

### Использование в React

```tsx
const fileInputRef = useRef<HTMLInputElement>(null);

const handleUpload = async () => {
  const file = fileInputRef.current?.files?.[0];
  if (!file) return;

  try {
    const url = await uploadProductImage(file, 'temp-product-id');
    console.log('Загружено:', url);
  } catch (err) {
    console.error('Ошибка:', err);
  }
};

return (
  <>
    <input ref={fileInputRef} type="file" accept="image/*" />
    <button onClick={handleUpload}>Загрузить</button>
  </>
);
```

> **💡 Совет**: При создании нового товара ещё нет `productId`. Паттерн:
> сначала `insert` товар → получить `id` → загрузить фото → `update` поле `images`.
> Именно так сделано в шаблоне `ProductForm.tsx`.

---

## 2. 📦 CRUD-операции с товарами

### Инициализация Supabase-клиента (фронтенд)

```typescript
// src/lib/supabase.ts (ФРОНТЕНД — anon key!)
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,  // НЕ service role!
);
```

### 📋 Получение списка товаров

```typescript
import type { Product, ProductCategory } from './types';

interface FetchOptions {
  category?: ProductCategory;
  limit?: number;
  offset?: number;
  sort?: 'newest' | 'price_asc' | 'price_desc';
}

async function fetchProducts(options: FetchOptions = {}) {
  const { category, limit = 50, offset = 0, sort = 'newest' } = options;

  let query = supabase
    .from('products')
    .select('*', { count: 'exact' });  // count для пагинации

  if (category) {
    query = query.eq('category', category);
  }

  // Сортировка
  switch (sort) {
    case 'price_asc':
      query = query.order('price', { ascending: true });
      break;
    case 'price_desc':
      query = query.order('price', { ascending: false });
      break;
    default:
      query = query.order('created_at', { ascending: false });
  }

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    products: data as Product[],
    total: count ?? 0,
  };
}
```

**Примеры вызова:**

```typescript
// Все товары
const { products } = await fetchProducts();

// Только верхняя одежда, по возрастанию цены
const { products } = await fetchProducts({
  category: 'outerwear',
  sort: 'price_asc',
});

// Пагинация — страница 2 (по 12 товаров)
const { products, total } = await fetchProducts({
  limit: 12,
  offset: 12,
});
```

### ➕ Создание товара

```typescript
async function createProduct(input: {
  title: string;
  price: number;
  category: ProductCategory;
  sizes: Size[];
  colors: string[];
  images: string[];
  description: string;
}): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .insert(input)
    .select()        // ← важно! возвращает созданную запись
    .single();

  if (error) throw error;
  return data as Product;
}

// Использование:
const product = await createProduct({
  title: 'Куртка Outsider Classic',
  price: 850000,    // 850 000 UZS
  category: 'outerwear',
  sizes: ['S', 'M', 'L', 'XL'],
  colors: ['#1a1a2e', '#e8e8e8'],
  images: [],        // пока пустой — изображения добавим после загрузки
  description: 'Утеплённая куртка из коллекции FW25',
});
```

### ✏️ Обновление товара

```typescript
async function updateProduct(
  id: string,
  updates: Partial<Omit<Product, 'id' | 'created_at'>>,
): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as Product;
}

// Обновить цену и добавить размер:
await updateProduct('550e8400-...', {
  price: 920000,    // 920 000 UZS
  sizes: ['M', 'L', 'XL', 'XXL'],
});

// Обновить массив изображений после загрузки:
await updateProduct(product.id, {
  images: [...product.images, newImageUrl],
});
```

### 🗑️ Удаление товара

```typescript
async function deleteProduct(id: string): Promise<void> {
  // 1. Удаляем изображения из Storage
  const { data: files } = await supabase.storage
    .from('products')
    .list(id);  // все файлы в папке {productId}/

  if (files && files.length > 0) {
    const paths = files.map((f) => `${id}/${f.name}`);
    await supabase.storage.from('products').remove(paths);
  }

  // 2. Удаляем запись из БД
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
```

---

## 3. ⚛️ Шаблон React-компонента

Готовый компонент находится в:

📄 **`docs/examples/ProductForm.tsx`**

### Что включено

| Элемент              | Реализация |
|---------------------|------------|
| Название + цена      | `<input>` с валидацией |
| Категория            | `<select>` с предустановленными значениями |
| Размеры              | Chip-селектор (toggle-кнопки) |
| Цвета                | Цветовая палитра (swatch-кнопки) |
| Загрузка фото        | Multiple file input + превью + удаление |
| Валидация            | Клиентская, перед отправкой |
| Состояния UI         | `isSubmitting`, `error`, `success` |

### BEM-классы для стилизации

Все CSS-классы используют BEM-нотацию с префиксом `product-form__`:

```css
/* Основа */
.product-form { }
.product-form__title { }
.product-form__field { }
.product-form__label { }
.product-form__input { }
.product-form__select { }
.product-form__textarea { }

/* Алерты */
.product-form__alert { }
.product-form__alert--error { }
.product-form__alert--success { }

/* Чипы размеров */
.product-form__chip-group { }
.product-form__chip { }
.product-form__chip--active { }

/* Цветовые swatches */
.product-form__color-group { }
.product-form__color-swatch { }
.product-form__color-swatch--active { }

/* Изображения */
.product-form__image-grid { }
.product-form__image-card { }
.product-form__image-preview { }
.product-form__image-remove { }
.product-form__image-add { }

/* Кнопка отправки */
.product-form__submit { }
```

### Алгоритм создания товара (двухэтапный)

```
1. INSERT товар → получаем product.id
          ↓
2. UPLOAD фото в Storage (папка = product.id)
          ↓
3. UPDATE товар — записываем URLs в поле images
          ↓
4. Callback onProductCreated(finalProduct)
```

### Подключение в проект

```tsx
import ProductForm from './components/ProductForm';

function AdminPage() {
  return (
    <div className="admin-page">
      <ProductForm
        onProductCreated={(product) => {
          console.log('Новый товар:', product);
          // обновить список, показать toast и т.д.
        }}
      />
    </div>
  );
}
```

---

## 4. 🛒 Оформление заказа (Checkout API)

Для отправки заказа из корзины клиент отправляет `POST`-запрос на серверный эндпоинт `/api/orders` (или вызывает `handleCreateOrder(payload)`).

### Контракт запроса (`OrderPayload`)

| Поле | Тип | Обязательно | Описание |
| :--- | :--- | :---: | :--- |
| `name` | `string` | ✅ | Имя покупателя |
| `phone` | `string` | ✅ | Телефон (рекомендуется международный формат) |
| `contactMethod` | `'Phone' \| 'Telegram' \| 'WhatsApp'` | ❌ | Предпочтительный способ связи (по умолчанию `Phone`) |
| `currency` | `'UZS' \| 'RUB' \| 'USD' \| 'KZT'` | ❌ | Валюта заказа (по умолчанию `UZS`) |
| `email` | `string` | ❌ | Email для отправки чека (опционально) |
| `deliveryAddress` | `string` | ❌ | Адрес доставки (город, улица, дом, кв.) |
| `comment` | `string` | ❌ | Комментарий / пожелания к доставке |
| `totalAmount` | `number` | ❌ | Итоговая сумма в выбранной валюте (если не указана, сервер рассчитает сам) |
| `items` | `OrderItem[]` | ❌ | Список товаров из корзины |

#### Структура элемента `items`:
```typescript
interface OrderItem {
  product_id: string;  // UUID товара из каталога
  title?: string;      // Название ("Худи Oversize Outsider")
  size: Size;          // 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | 'ONESIZE'
  color: string;       // Цвет ("Черный графит")
  quantity: number;    // Кол-во (целое >= 1)
  price?: number;      // Цена за единицу в выбранной валюте
}
```

### Пример функции отправки заказа (React / TypeScript)

```typescript
export async function submitOrder(payload: {
  name: string;
  phone: string;
  contactMethod?: 'Phone' | 'Telegram' | 'WhatsApp';
  currency?: 'UZS' | 'RUB' | 'USD' | 'KZT';
  email?: string;
  deliveryAddress?: string;
  comment?: string;
  items?: Array<{
    product_id: string;
    title?: string;
    size: 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | 'ONESIZE';
    color: string;
    quantity: number;
    price?: number;
  }>;
  totalAmount?: number;
}) {
  const response = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.details?.join(', ') || data.error || 'Ошибка создания заказа');
  }

  return data;
}
```

### Формат ответов сервера

- **Успех (201 Created)**:
```json
{
  "success": true,
  "order": {
    "id": "c1f7a0b3-96b4-4b5b-80a1-638bc2fa8a1e",
    "status": "new",
    "created_at": "2026-10-15T09:23:48.000Z"
  },
  "notifications": {
    "telegram": true,
    "email": true
  }
}
```

- **Ошибка валидации (400 Bad Request)**:
```json
{
  "success": false,
  "error": "Ошибка валидации",
  "details": [
    "Поле \"name\" обязательно и должно быть непустой строкой",
    "Поле \"phone\" обязательно и должно быть непустой строкой"
  ]
}
```

---

## 5. 🇺🇿 Локализация и валюта (Узбекистан)

1. **Валюта — UZS (узбекский сум)**:
   - Все цены в базе данных и запросах — **целые числа** (без копеек/тийинов).
   - Пример: `650000` → `650 000 UZS`.
   - Рекомендуемая утилита форматирования для фронтенда:
     ```typescript
     export function formatPrice(amount: number): string {
       return `${new Intl.NumberFormat('ru-RU').format(Math.round(amount))} UZS`;
     }
     ```

2. **Телефонный номер**:
   - Маска ввода: `+998 (__) ___-__-__`.
   - Поддерживаются мобильные операторы Узбекистана: `90`, `91`, `93`, `94`, `95`, `97`, `98`, `99`, `33`, `88` и др.

3. **Часовой пояс**:
   - Все серверные уведомления (Telegram, Email) работают в таймзоне `Asia/Tashkent` (UTC+5).

---

## 🔐 Переменные окружения (фронтенд)

Создай файл `.env` в корне React-проекта (Vite):

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...your-anon-key
```

> ⚠️ **Используй `anon` key**, а НЕ `service_role`! Service role обходит RLS и никогда не должен попадать на фронтенд.

---

## 📌 Чеклист перед запуском

- [ ] Создан бакет `products` в Supabase Storage (public)
- [ ] Добавлены RLS-политики для бакета
- [ ] Таблица `products` и `orders` созданы (миграция `001_create_tables.sql`)
- [ ] Переменные `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` заданы
- [ ] Цены отображаются и отправляются в валюте **UZS**
- [ ] Настроена форма корзины с отправкой на `/api/orders`

