-- ============================================================
-- Outsider klyne — начальная миграция
-- Supabase / PostgreSQL
-- ============================================================

-- ── 1. Расширения ───────────────────────────────────────────
-- uuid-ossp обычно уже включено в Supabase, но на всякий случай
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 2. Таблица товаров ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title       TEXT        NOT NULL,
  price       INTEGER     NOT NULL CHECK (price >= 0),
  category    TEXT        NOT NULL CHECK (
                category IN ('outerwear','tops','bottoms','dresses','accessories')
              ),
  sizes       TEXT[]      NOT NULL DEFAULT '{}',
  colors      TEXT[]      NOT NULL DEFAULT '{}',
  images      TEXT[]      NOT NULL DEFAULT '{}',
  description TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  products             IS 'Каталог товаров Outsider klyne';
COMMENT ON COLUMN products.price       IS 'Цена в сумах UZS (целое)';
COMMENT ON COLUMN products.sizes       IS 'Массив размеров: XS, S, M, L, XL, XXL, ONESIZE';
COMMENT ON COLUMN products.colors      IS 'Массив цветов (hex или именованные)';
COMMENT ON COLUMN products.images      IS 'URL-адреса изображений товара';

-- ── 3. Таблица заказов ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT        NOT NULL,
  phone       TEXT        NOT NULL,
  email       TEXT        NOT NULL,
  comment     TEXT,
  items       JSONB,                          -- массив { product_id, size, color, quantity }
  status      TEXT        NOT NULL DEFAULT 'new' CHECK (
                status IN ('new','processing','completed','cancelled')
              ),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  orders           IS 'Заказы покупателей';
COMMENT ON COLUMN orders.items     IS 'JSON-массив позиций заказа (product_id, size, color, quantity)';
COMMENT ON COLUMN orders.status    IS 'Статус: new → processing → completed | cancelled';

-- ── 4. Индексы ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_category  ON products (category);
CREATE INDEX IF NOT EXISTS idx_orders_status      ON orders   (status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at  ON orders   (created_at DESC);

-- ── 5. Row Level Security ───────────────────────────────────

-- Products: публичное чтение, запись только для аутентифицированных
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_public_read"
  ON products FOR SELECT
  USING (true);                               -- любой может читать каталог

CREATE POLICY "products_auth_insert"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (true);                          -- вставка для авторизованных

CREATE POLICY "products_auth_update"
  ON products FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);                          -- обновление для авторизованных

CREATE POLICY "products_auth_delete"
  ON products FOR DELETE
  TO authenticated
  USING (true);                               -- удаление для авторизованных

-- Orders: создание для всех (анонимный checkout), чтение/изменение для auth
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_public_insert"
  ON orders FOR INSERT
  WITH CHECK (true);                          -- гости тоже могут оформить заказ

CREATE POLICY "orders_auth_select"
  ON orders FOR SELECT
  TO authenticated
  USING (true);                               -- просмотр заказов только для auth

CREATE POLICY "orders_auth_update"
  ON orders FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);                          -- смена статуса для auth

-- ============================================================
-- Готово! Таблицы, индексы и RLS-политики созданы.
-- ============================================================
