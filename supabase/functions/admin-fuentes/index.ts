// Edge Function: admin-fuentes
//
// Oculta o vuelve a mostrar páginas de origen para TODO el sitio
// (CP-F3-ADM-005). La nómina vive en public.source_visibility: cualquier
// visitante la lee con la clave pública (RLS de solo lectura) y la app filtra
// su catálogo con ella. Solo esta función escribe, con service_role.
//
// Acciones (POST, JSON { accion, ... }):
//   listar                          → { fuentes: string[] } (nombres ocultos)
//   definir   { fuente, oculta }    → { fuentes } tras ocultar/mostrar una
//   definir_todas { fuentes[], oculta } → { fuentes } tras el cambio masivo
//
// Seguridad: mismo criterio que admin-eventos. JWT válido de Supabase Auth,
// proveedor 'email' (no OAuth) y public.profiles.role = 'admin' consultado
// en la base con service_role (no se confía en user_metadata).
//
// Despliegue:
//   supabase functions deploy admin-fuentes --project-ref ngwkehuewmjykiiujqic
//
// Secretos requeridos: SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL.
// deno-lint-ignore-file no-explicit-any
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const PROJECT_URL = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('URL') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type'
} as Record<string, string>;

const MAX_FUENTES = 500;
const MAX_NOMBRE = 200;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}

/** Nómina actual: nombres de páginas ocultas. */
async function listar(admin: SupabaseClient): Promise<string[]> {
  const { data, error } = await admin
    .from('source_visibility')
    .select('source_name')
    .eq('hidden', true)
    .order('source_name', { ascending: true });
  if (error) throw new Error('No se pudo leer la nómina de páginas ocultas.');
  return ((data ?? []) as { source_name: string }[])
    .map((f) => f.source_name)
    .filter((n) => typeof n === 'string' && n.trim() !== '');
}

function limpiarNombre(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const nombre = valor.trim();
  if (!nombre || nombre.length > MAX_NOMBRE) return null;
  return nombre;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });
  if (!SERVICE_KEY || !PROJECT_URL) {
    return json(503, { error: 'Edge Function sin SUPABASE_SERVICE_ROLE_KEY configurada' });
  }

  // ---- Puerta de acceso (idéntica a admin-eventos) ----------------------
  const admin = createClient(PROJECT_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'Se requiere sesión de administrador.' });

  const { data: quien, error: errQuien } = await admin.auth.getUser(token);
  if (errQuien || !quien?.user) {
    return json(401, { error: 'Sesión inválida o expirada.' });
  }

  const aplico = (quien.user.app_metadata ?? {}) as Record<string, unknown>;
  if (typeof aplico['provider'] === 'string' && aplico['provider'] !== 'email') {
    return json(403, { error: 'El panel no acepta cuentas de proveedores OAuth.' });
  }

  const { data: perfil, error: errPerfil } = await admin
    .from('profiles')
    .select('role')
    .eq('id', quien.user.id)
    .maybeSingle();
  if (errPerfil || perfil?.role !== 'admin') {
    return json(403, { error: 'Tu cuenta no tiene el rol de administración requerido.' });
  }

  // ---- Cuerpo ----------------------------------------------------------
  let cuerpo: {
    accion?: string;
    fuente?: unknown;
    fuentes?: unknown;
    oculta?: unknown;
  };
  try {
    cuerpo = await req.json();
  } catch {
    return json(400, { error: 'Se requiere JSON' });
  }

  try {
    switch (cuerpo.accion) {
      case 'listar': {
        return json(200, { fuentes: await listar(admin) });
      }

      case 'definir': {
        const fuente = limpiarNombre(cuerpo.fuente);
        if (!fuente) return json(400, { error: 'Falta el nombre de la página.' });
        if (typeof cuerpo.oculta !== 'boolean') {
          return json(400, { error: 'Falta el estado de ocultación.' });
        }

        if (cuerpo.oculta) {
          const { error } = await admin.from('source_visibility').upsert(
            {
              source_name: fuente,
              hidden: true,
              updated_by: quien.user.id,
              updated_at: new Date().toISOString()
            },
            { onConflict: 'source_name' }
          );
          if (error) return json(500, { error: 'No se pudo ocultar la página.' });
        } else {
          const { error } = await admin
            .from('source_visibility')
            .delete()
            .eq('source_name', fuente);
          if (error) return json(500, { error: 'No se pudo mostrar la página.' });
        }
        return json(200, { fuentes: await listar(admin) });
      }

      case 'definir_todas': {
        if (typeof cuerpo.oculta !== 'boolean') {
          return json(400, { error: 'Falta el estado de ocultación.' });
        }
        const crudas = Array.isArray(cuerpo.fuentes) ? cuerpo.fuentes : [];
        const nombres = [...new Set(crudas.map(limpiarNombre).filter((n): n is string => !!n))];
        if (nombres.length > MAX_FUENTES) {
          return json(400, { error: `Máximo ${MAX_FUENTES} páginas por cambio.` });
        }

        // Se reemplaza la nómina completa: la operación masiva define el estado.
        const { error: errBorrar } = await admin
          .from('source_visibility')
          .delete()
          .neq('source_name', '');
        if (errBorrar) return json(500, { error: 'No se pudo actualizar la nómina.' });

        if (cuerpo.oculta && nombres.length) {
          const filas = nombres.map((source_name) => ({
            source_name,
            hidden: true,
            updated_by: quien.user.id,
            updated_at: new Date().toISOString()
          }));
          const { error } = await admin.from('source_visibility').insert(filas);
          if (error) return json(500, { error: 'No se pudieron ocultar las páginas.' });
        }

        return json(200, { fuentes: await listar(admin) });
      }

      default:
        return json(400, { error: 'Acción no reconocida.' });
    }
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : 'Error inesperado.';
    return json(500, { error: mensaje });
  }
});
