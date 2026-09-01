/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_MATRIX_SERVER?: string;
  readonly PUBLIC_SUPABASE_URL?: string;
  readonly PUBLIC_SUPABASE_ANON_KEY?: string;
  readonly PUBLIC_DIODATI_TEST_OPENING_AT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
