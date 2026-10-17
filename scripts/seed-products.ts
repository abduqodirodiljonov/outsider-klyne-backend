import fs from 'node:fs';
import path from 'node:path';
import { getSupabaseAdmin } from '../src/lib/supabase';

async function seedProducts() {
  const supabase = getSupabaseAdmin();
  const baseDir = 'C:/Users/NoutKomp/.gemini/antigravity-ide/brain/04aa300c-c2ef-4fc6-b23c-e5d0a121c0dd/.user_uploaded';

  const fileMap = {
    tshirtBlack: { src: 'media_1792244373777.jpg', dest: 't-shirts/tshirt-black-lost-moving.jpg' },
    longsleeve:  { src: 'media_1792244373802.jpg', dest: 'longsleeves/longsleeve-white-lost-moving.jpg' },
    tshirtWhite: { src: 'media_1792244373892.jpg', dest: 't-shirts/tshirt-white-lost-moving.jpg' },
    hoodieBlack: { src: 'media_1792244373926.jpg', dest: 'hoodies/hoodie-black-lost-moving.jpg' },
    hoodieBlue:  { src: 'media_1792244373945.jpg', dest: 'hoodies/hoodie-blue-lost-moving.jpg' },
  };

  const uploadedUrls: Record<string, string> = {};

  for (const [key, item] of Object.entries(fileMap)) {
    const fullPath = path.join(baseDir, item.src);
    const fileBuffer = fs.readFileSync(fullPath);

    const { error: upErr } = await supabase.storage
      .from('products')
      .upload(item.dest, fileBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (upErr) {
      console.error(`Upload error for ${item.dest}:`, upErr);
    } else {
      const { data } = supabase.storage.from('products').getPublicUrl(item.dest);
      uploadedUrls[key] = data.publicUrl;
      console.log(`✅ Uploaded ${item.dest} -> ${data.publicUrl}`);
    }
  }

  const productsToInsert = [
    {
      title: 'Худи Oversize Outsider "Lost But Still Moving"',
      price: 0,
      category: 'outerwear',
      sizes: ['S', 'M', 'L', 'XL'],
      colors: ['Черный', 'Светло-голубой', 'Коричневый'],
      images: [uploadedUrls.hoodieBlack, uploadedUrls.hoodieBlue].filter(Boolean),
      description: 'Худи свободного кроя с фирменной каллиграфией "WE ARE LOST BUT STILL MOVING" на спине. Плотный хлопок с начесом, глубокий капюшон, спущенная линия плеча.',
    },
    {
      title: 'Футболка Heavyweight Outsider "Lost But Still Moving"',
      price: 0,
      category: 'tops',
      sizes: ['S', 'M', 'L', 'XL'],
      colors: ['Черный', 'Белый', 'Коричневый'],
      images: [uploadedUrls.tshirtBlack, uploadedUrls.tshirtWhite].filter(Boolean),
      description: 'Футболка свободного кроя Boxy Fit из плотного премиального хлопка. Авторский принт "WE ARE LOST BUT STILL MOVING" на спине.',
    },
    {
      title: 'Лонгслив Outsider "Lost But Still Moving"',
      price: 0,
      category: 'tops',
      sizes: ['S', 'M', 'L', 'XL'],
      colors: ['Белый', 'Черный'],
      images: [uploadedUrls.longsleeve].filter(Boolean),
      description: 'Лонгслив свободного кроя с акцентным принтом "WE ARE LOST BUT STILL MOVING". Мягкий дышащий хлопковый трикотаж, эластичные манжеты.',
    },
  ];

  for (const prod of productsToInsert) {
    const { data, error } = await supabase.from('products').insert(prod).select().single();
    if (error) {
      console.error(`Insert error for ${prod.title}:`, error);
    } else {
      console.log(`🎉 Создан товар: ${data.title} (ID: ${data.id})`);
    }
  }

  console.log('\n✨ Все реальные товары Outsider Klyne успешно добавлены в базу!');
}

seedProducts().catch(console.error);
