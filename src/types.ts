// ─────────────────────────────────────────────
// Outsider klyne — Backend type definitions
// ─────────────────────────────────────────────

/* ── Product ─────────────────────────────────── */

/** Категории товаров бренда (стритвир) */
export type ProductCategory =
  | 'outerwear'   // худи, свитшоты, куртки
  | 'tops'        // футболки, лонгсливы
  | 'bottoms';    // брюки, джоггеры, шорты

/** Размерная сетка */
export type Size = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | 'ONESIZE';

/**
 * Товар каталога.
 * Соответствует строке таблицы `products` в Supabase.
 */
export interface Product {
  /** UUID, генерируется Supabase */
  id: string;
  /** Название товара */
  title: string;
  /** Цена в сумах (UZS, целое число) */
  price: number;
  /** Категория товара */
  category: ProductCategory;
  /** Доступные размеры */
  sizes: Size[];
  /** Доступные цвета (hex или именованные) */
  colors: string[];
  /** URL-адреса изображений товара */
  images: string[];
  /** Описание товара (может быть пустым) */
  description: string;
  /** Дата создания записи (ISO 8601) */
  created_at: string;
}

/* ── Order ───────────────────────────────────── */

/** Поддерживаемые валюты заказа */
export type Currency = 'UZS' | 'RUB' | 'USD' | 'KZT';

/** Предпочтительный способ связи */
export type ContactMethod = 'Phone' | 'Telegram' | 'WhatsApp';

/** Позиция заказа: товар + выбранный размер / цвет / кол-во */
export interface OrderItem {
  product_id: string;
  title?: string;
  size: Size;
  color: string;
  quantity: number;
  price?: number;
}

/**
 * Payload, который фронтенд отправляет при оформлении заказа.
 */
export interface OrderPayload {
  /** Имя покупателя */
  name: string;
  /** Телефон */
  phone: string;
  /** Электронная почта */
  email?: string;
  /** Адрес доставки */
  deliveryAddress?: string;
  /** Предпочтительный способ связи */
  contactMethod?: ContactMethod;
  /** Выбранная валюта заказа */
  currency?: Currency;
  /** Комментарий к заказу */
  comment?: string;
  /** Выбранные товары (опционально для демо) */
  items?: OrderItem[];
  /** Итоговая сумма заказа в выбранной валюте */
  totalAmount?: number;
}

/** Статус заказа в системе */
export type OrderStatus = 'new' | 'processing' | 'completed' | 'cancelled';

/**
 * Заказ, как он хранится в БД.
 * Соответствует строке таблицы `orders`.
 */
export interface Order {
  id: string;
  name: string;
  phone: string;
  email: string;
  comment: string | null;
  items: OrderItem[] | null;
  currency?: Currency;
  contact_method?: ContactMethod;
  status: OrderStatus;
  created_at: string;
}
