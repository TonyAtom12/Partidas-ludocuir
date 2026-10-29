import { createClient } from '@supabase/supabase-js';

// La anon key es pública por diseño; la seguridad la dan las políticas RLS de la base de datos.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
