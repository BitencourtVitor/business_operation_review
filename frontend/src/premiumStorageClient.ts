import { createClient } from '@supabase/supabase-js';

const premiumStorageUrl = import.meta.env.VITE_PUBLIC_PREMIUM_STORAGE_URL;
const premiumStorageKey = import.meta.env.VITE_PUBLIC_PREMIUM_STORAGE_KEY;

if (!premiumStorageUrl || !premiumStorageKey) {
  console.warn('⚠️ Premium Storage variables not found in .env!');
}

export const premiumStorageClient = createClient(
  premiumStorageUrl || '',
  premiumStorageKey || ''
);
