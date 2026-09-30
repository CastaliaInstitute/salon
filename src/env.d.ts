/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_MATRIX_SERVER?: string;
  /**
   * Supabase project for member salon entry (/diodati/enter/): OAuth sign-in and
   * the villa-diodati-chat edge function. Publishable anon key only — no
   * service/secret keys may ever be referenced from client code.
   */
  readonly PUBLIC_SUPABASE_URL?: string;
  readonly PUBLIC_SUPABASE_ANON_KEY?: string;
  readonly PUBLIC_DIODATI_TEST_OPENING_AT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
