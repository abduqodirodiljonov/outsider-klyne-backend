// ─────────────────────────────────────────────
// Outsider klyne — Пример React-компонента формы добавления товара
// ─────────────────────────────────────────────
// Это ШАБЛОН для фронтендера. Стили (CSS) добавляются отдельно.
// Компонент полностью рабочий — можно вставить в проект и доработать визуал.
//
// Зависимости:
//   npm install @supabase/supabase-js react react-dom
//   npm install -D @types/react @types/react-dom

import React, { useState, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

/* ── Типы (копия из бэкенда — в реальном проекте вынеси в shared-пакет) ── */

type ProductCategory = 'outerwear' | 'tops' | 'bottoms' | 'dresses' | 'accessories';
type Size = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | 'ONESIZE';

interface Product {
  id: string;
  title: string;
  price: number;
  category: ProductCategory;
  sizes: Size[];
  colors: string[];
  images: string[];
  description: string;
  created_at: string;
}

/* ── Supabase-клиент (фронтенд — anon key, НЕ service role!) ── */

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL ?? '',
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
);

/* ── Константы ── */

const CATEGORIES: { value: ProductCategory; label: string }[] = [
  { value: 'outerwear',   label: 'Верхняя одежда' },
  { value: 'tops',        label: 'Верх (футболки, худи)' },
  { value: 'bottoms',     label: 'Низ (брюки, джинсы)' },
  { value: 'dresses',     label: 'Платья' },
  { value: 'accessories', label: 'Аксессуары' },
];

const ALL_SIZES: Size[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'ONESIZE'];

const PRESET_COLORS = [
  { hex: '#1a1a2e', name: 'Тёмно-синий' },
  { hex: '#000000', name: 'Чёрный' },
  { hex: '#ffffff', name: 'Белый' },
  { hex: '#e8e8e8', name: 'Светло-серый' },
  { hex: '#8b4513', name: 'Коричневый' },
  { hex: '#c41e3a', name: 'Красный' },
  { hex: '#2e5e3f', name: 'Хаки' },
];

/* ── Вспомогательные функции ── */

/**
 * Загружает файл в Supabase Storage и возвращает публичный URL.
 */
async function uploadImage(file: File, productId: string): Promise<string> {
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${productId}/${timestamp}_${safeName}`;

  const { error } = await supabase.storage
    .from('products')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    });

  if (error) throw new Error(`Ошибка загрузки: ${error.message}`);

  const { data } = supabase.storage
    .from('products')
    .getPublicUrl(path);

  return data.publicUrl;
}

/* ══════════════════════════════════════════════
   Компонент: ProductForm
   ══════════════════════════════════════════════ */

interface ProductFormProps {
  /** Callback после успешного создания товара */
  onProductCreated?: (product: Product) => void;
}

export default function ProductForm({ onProductCreated }: ProductFormProps) {
  /* ── Состояние формы ── */
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState<ProductCategory>('tops');
  const [sizes, setSizes] = useState<Size[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [description, setDescription] = useState('');

  /* ── Файлы и превью ── */
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── UI-состояние ── */
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  /* ── Обработчики ── */

  /** Переключение размера */
  const toggleSize = useCallback((size: Size) => {
    setSizes((prev) =>
      prev.includes(size)
        ? prev.filter((s) => s !== size)
        : [...prev, size],
    );
  }, []);

  /** Переключение цвета */
  const toggleColor = useCallback((hex: string) => {
    setColors((prev) =>
      prev.includes(hex)
        ? prev.filter((c) => c !== hex)
        : [...prev, hex],
    );
  }, []);

  /** Обработка выбора файлов */
  const handleFilesSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    setImageFiles((prev) => [...prev, ...files]);

    // Создаём превью
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setImagePreviews((prev) => [...prev, ev.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  /** Удаление превью */
  const removeImage = useCallback((index: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  }, []);

  /** Отправка формы */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    // Валидация
    if (!title.trim()) return setError('Введите название товара');
    if (!price || Number(price) <= 0) return setError('Введите корректную цену');
    if (sizes.length === 0) return setError('Выберите хотя бы один размер');
    if (colors.length === 0) return setError('Выберите хотя бы один цвет');

    setIsSubmitting(true);

    try {
      // 1. Создаём товар в БД (пока без изображений — нужен ID)
      const { data: product, error: insertError } = await supabase
        .from('products')
        .insert({
          title: title.trim(),
          price: Number(price),
          category,
          sizes,
          colors,
          images: [],
          description: description.trim(),
        })
        .select()
        .single<Product>();

      if (insertError || !product) {
        throw new Error(insertError?.message ?? 'Не удалось создать товар');
      }

      // 2. Загружаем изображения в Storage
      let imageUrls: string[] = [];
      if (imageFiles.length > 0) {
        const uploadPromises = imageFiles.map((file) =>
          uploadImage(file, product.id),
        );
        imageUrls = await Promise.all(uploadPromises);

        // 3. Обновляем товар — добавляем URL изображений
        const { error: updateError } = await supabase
          .from('products')
          .update({ images: imageUrls })
          .eq('id', product.id);

        if (updateError) {
          console.error('Ошибка обновления изображений:', updateError);
        }
      }

      // Готово!
      const finalProduct: Product = { ...product, images: imageUrls };
      console.log('✅ Товар создан:', finalProduct);
      setSuccess(true);
      onProductCreated?.(finalProduct);

      // Сброс формы
      setTitle('');
      setPrice('');
      setCategory('tops');
      setSizes([]);
      setColors([]);
      setDescription('');
      setImageFiles([]);
      setImagePreviews([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Произошла ошибка');
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ── Рендер ── */

  return (
    <form onSubmit={handleSubmit} className="product-form">
      <h2 className="product-form__title">Добавить товар</h2>

      {/* ── Статус ── */}
      {error && (
        <div className="product-form__alert product-form__alert--error">
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div className="product-form__alert product-form__alert--success">
          ✅ Товар успешно добавлен!
        </div>
      )}

      {/* ── Название ── */}
      <div className="product-form__field">
        <label htmlFor="pf-title" className="product-form__label">
          Название товара *
        </label>
        <input
          id="pf-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Куртка Outsider Classic"
          className="product-form__input"
          disabled={isSubmitting}
        />
      </div>

      {/* ── Цена ── */}
      <div className="product-form__field">
        <label htmlFor="pf-price" className="product-form__label">
          Цена (UZS) *
        </label>
        <input
          id="pf-price"
          type="number"
          min="0"
          step="100"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="12900"
          className="product-form__input"
          disabled={isSubmitting}
        />
      </div>

      {/* ── Категория ── */}
      <div className="product-form__field">
        <label htmlFor="pf-category" className="product-form__label">
          Категория *
        </label>
        <select
          id="pf-category"
          value={category}
          onChange={(e) => setCategory(e.target.value as ProductCategory)}
          className="product-form__select"
          disabled={isSubmitting}
        >
          {CATEGORIES.map((cat) => (
            <option key={cat.value} value={cat.value}>
              {cat.label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Размеры ── */}
      <fieldset className="product-form__fieldset">
        <legend className="product-form__legend">Размеры *</legend>
        <div className="product-form__chip-group">
          {ALL_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => toggleSize(size)}
              disabled={isSubmitting}
              className={`product-form__chip ${
                sizes.includes(size) ? 'product-form__chip--active' : ''
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </fieldset>

      {/* ── Цвета ── */}
      <fieldset className="product-form__fieldset">
        <legend className="product-form__legend">Цвета *</legend>
        <div className="product-form__color-group">
          {PRESET_COLORS.map((color) => (
            <button
              key={color.hex}
              type="button"
              onClick={() => toggleColor(color.hex)}
              disabled={isSubmitting}
              className={`product-form__color-swatch ${
                colors.includes(color.hex) ? 'product-form__color-swatch--active' : ''
              }`}
              style={{ backgroundColor: color.hex }}
              title={color.name}
              aria-label={color.name}
            />
          ))}
        </div>
      </fieldset>

      {/* ── Описание ── */}
      <div className="product-form__field">
        <label htmlFor="pf-description" className="product-form__label">
          Описание
        </label>
        <textarea
          id="pf-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Утеплённая куртка из коллекции FW25..."
          rows={4}
          className="product-form__textarea"
          disabled={isSubmitting}
        />
      </div>

      {/* ── Загрузка изображений ── */}
      <fieldset className="product-form__fieldset">
        <legend className="product-form__legend">Фотографии</legend>

        <div className="product-form__image-grid">
          {imagePreviews.map((src, i) => (
            <div key={i} className="product-form__image-card">
              <img
                src={src}
                alt={`Превью ${i + 1}`}
                className="product-form__image-preview"
              />
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="product-form__image-remove"
                aria-label="Удалить изображение"
              >
                ✕
              </button>
            </div>
          ))}

          {/* Кнопка-добавление */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="product-form__image-add"
            disabled={isSubmitting}
          >
            <span className="product-form__image-add-icon">＋</span>
            <span className="product-form__image-add-text">Добавить фото</span>
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFilesSelected}
          style={{ display: 'none' }}
        />
      </fieldset>

      {/* ── Кнопка отправки ── */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="product-form__submit"
      >
        {isSubmitting ? 'Сохранение...' : 'Добавить товар'}
      </button>
    </form>
  );
}
