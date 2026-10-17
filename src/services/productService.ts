// ─────────────────────────────────────────────
// Outsider klyne — Product service
// ─────────────────────────────────────────────
// CRUD-операции и загрузка изображений в Supabase Storage.
// Этот модуль используется как на бэкенде (Service Role),
// так и может служить справочником для фронтендера.

import { getSupabaseAdmin } from '../lib/supabase';
import type { Product, ProductCategory } from '../types';

/** Имя бакета в Supabase Storage */
const STORAGE_BUCKET = 'products';

/* ══════════════════════════════════════════════
   Загрузка изображений
   ══════════════════════════════════════════════ */

export interface UploadResult {
  /** Публичный URL загруженного изображения */
  publicUrl: string;
  /** Путь файла внутри бакета */
  storagePath: string;
}

/**
 * Загружает изображение товара в Supabase Storage.
 *
 * @param file      — File (из input[type="file"]) или Buffer
 * @param fileName  — оригинальное имя файла (например, "jacket-front.jpg")
 * @param productId — UUID товара (используется как папка)
 * @returns публичный URL и путь в storage
 *
 * @example
 * ```ts
 * const file = inputRef.current.files[0];
 * const result = await uploadProductImage(file, file.name, productId);
 * console.log(result.publicUrl); // https://xxx.supabase.co/storage/v1/object/public/products/...
 * ```
 */
export async function uploadProductImage(
  file: File | Buffer,
  fileName: string,
  productId: string,
): Promise<UploadResult> {
  const supabase = getSupabaseAdmin();

  // Генерируем уникальный путь: products/{productId}/{timestamp}_{fileName}
  const timestamp = Date.now();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${productId}/${timestamp}_${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file instanceof File ? file.type : 'image/jpeg',
    });

  if (uploadError) {
    throw new Error(`Ошибка загрузки изображения: ${uploadError.message}`);
  }

  // Получаем публичный URL
  const { data: urlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(storagePath);

  return {
    publicUrl: urlData.publicUrl,
    storagePath,
  };
}

/**
 * Удаляет изображения из Supabase Storage.
 *
 * @param storagePaths — массив путей внутри бакета
 */
export async function deleteProductImages(storagePaths: string[]): Promise<void> {
  if (storagePaths.length === 0) return;

  const supabase = getSupabaseAdmin();

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove(storagePaths);

  if (error) {
    console.error('[Storage] Ошибка удаления изображений:', error);
  }
}

/* ══════════════════════════════════════════════
   CRUD — Products
   ══════════════════════════════════════════════ */

/** Параметры фильтрации списка товаров */
export interface ProductListParams {
  category?: ProductCategory;
  limit?: number;
  offset?: number;
  /** Сортировка: 'newest' (по умолчанию) | 'price_asc' | 'price_desc' */
  sort?: 'newest' | 'price_asc' | 'price_desc';
}

/** Результат запроса списка товаров */
export interface ProductListResult {
  products: Product[];
  /** Общее количество (для пагинации) */
  total: number;
}

/**
 * Получение списка товаров с фильтрацией и пагинацией.
 *
 * @example
 * ```ts
 * // Все товары, первая страница
 * const { products, total } = await getProducts();
 *
 * // Верхняя одежда, отсортированная по цене
 * const { products } = await getProducts({
 *   category: 'outerwear',
 *   sort: 'price_asc',
 *   limit: 12,
 * });
 * ```
 */
export async function getProducts(
  params: ProductListParams = {},
): Promise<ProductListResult> {
  const {
    category,
    limit = 50,
    offset = 0,
    sort = 'newest',
  } = params;

  const supabase = getSupabaseAdmin();

  let query = supabase
    .from('products')
    .select('*', { count: 'exact' });

  // Фильтр по категории
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
    case 'newest':
    default:
      query = query.order('created_at', { ascending: false });
      break;
  }

  // Пагинация
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Ошибка получения товаров: ${error.message}`);
  }

  return {
    products: (data ?? []) as Product[],
    total: count ?? 0,
  };
}

/**
 * Получение одного товара по ID.
 *
 * @example
 * ```ts
 * const product = await getProductById('550e8400-e29b-41d4-a716-446655440000');
 * ```
 */
export async function getProductById(id: string): Promise<Product | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .single<Product>();

  if (error) {
    if (error.code === 'PGRST116') return null; // not found
    throw new Error(`Ошибка получения товара: ${error.message}`);
  }

  return data;
}

/** Данные для создания товара (без id и created_at) */
export type CreateProductInput = Omit<Product, 'id' | 'created_at'>;

/**
 * Создание нового товара.
 *
 * @example
 * ```ts
 * const newProduct = await createProduct({
 *   title: 'Куртка Outsider Classic',
 *   price: 12900,
 *   category: 'outerwear',
 *   sizes: ['S', 'M', 'L', 'XL'],
 *   colors: ['#1a1a2e', '#e8e8e8'],
 *   images: ['https://xxx.supabase.co/storage/v1/object/public/products/...'],
 *   description: 'Утеплённая куртка из коллекции FW25',
 * });
 * ```
 */
export async function createProduct(input: CreateProductInput): Promise<Product> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('products')
    .insert(input)
    .select()
    .single<Product>();

  if (error) {
    throw new Error(`Ошибка создания товара: ${error.message}`);
  }

  if (!data) {
    throw new Error('Товар создан, но данные не возвращены');
  }

  console.log(`[Product] Создан товар: ${data.id} — ${data.title}`);
  return data;
}

/** Данные для обновления товара (все поля опциональны) */
export type UpdateProductInput = Partial<CreateProductInput>;

/**
 * Обновление товара.
 *
 * @example
 * ```ts
 * const updated = await updateProduct('550e8400-...', {
 *   price: 14900,
 *   sizes: ['M', 'L', 'XL', 'XXL'],
 * });
 * ```
 */
export async function updateProduct(
  id: string,
  input: UpdateProductInput,
): Promise<Product> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('products')
    .update(input)
    .eq('id', id)
    .select()
    .single<Product>();

  if (error) {
    throw new Error(`Ошибка обновления товара: ${error.message}`);
  }

  if (!data) {
    throw new Error('Товар не найден');
  }

  console.log(`[Product] Обновлён товар: ${data.id}`);
  return data;
}

/**
 * Удаление товара и связанных изображений из Storage.
 *
 * @example
 * ```ts
 * await deleteProduct('550e8400-...');
 * ```
 */
export async function deleteProduct(id: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Сначала получаем товар, чтобы узнать пути к изображениям
  const product = await getProductById(id);

  // Удаляем запись из БД
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Ошибка удаления товара: ${error.message}`);
  }

  // Удаляем папку с изображениями из Storage (best-effort)
  if (product) {
    try {
      const { data: files } = await supabase.storage
        .from(STORAGE_BUCKET)
        .list(id);

      if (files && files.length > 0) {
        const paths = files.map((f) => `${id}/${f.name}`);
        await deleteProductImages(paths);
      }
    } catch (err) {
      console.error(`[Storage] Не удалось очистить изображения товара ${id}:`, err);
    }
  }

  console.log(`[Product] Удалён товар: ${id}`);
}
