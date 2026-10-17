// ─────────────────────────────────────────────
// Outsider klyne — Barrel export
// ─────────────────────────────────────────────
// Единая точка входа для импорта всех модулей.

// Types
export type {
  Product,
  ProductCategory,
  Size,
  Currency,
  ContactMethod,
  OrderPayload,
  OrderItem,
  Order,
  OrderStatus,
} from './types';

// Lib
export { getEnv, loadEnv } from './lib/env';
export { getSupabaseAdmin } from './lib/supabase';

// Services
export {
  sendTelegramOrderNotification,
  sendTelegramNotification,
  formatCurrency,
} from './services/telegram';
export type {
  TelegramOrderData,
  TelegramOrderItem,
} from './services/telegram';
export { sendEmailNotification } from './services/email';
export {
  uploadProductImage,
  deleteProductImages,
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
} from './services/productService';
export type {
  UploadResult,
  ProductListParams,
  ProductListResult,
  CreateProductInput,
  UpdateProductInput,
} from './services/productService';

// Handlers
export { handleCreateOrder } from './handlers/createOrder';
export type { HandlerResponse } from './handlers/createOrder';
