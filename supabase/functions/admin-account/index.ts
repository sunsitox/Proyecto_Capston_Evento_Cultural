// Edge Function: admin-account
// Propósito: únicos dos puntos del sistema que requieren la SUPERVISOR key
// (service role) de Supabase. Todo lo demás lo maneja el cliente con la clave
// pública (RLS):
//   1. eliminar_cuenta       → DELETE /auth/v1/admin/users/<uid>
//   2. registrar_confirmado  → POST  /auth/v1/admin/users (desarrollo/demo:
//     crea la cuenta YA confirmada, sin depender del correo de verificación)
//
// Despliegue:
//   supabase functions deploy admin-account --project-ref ngwkehuewmjykiiujqic
// (Si se usa Supabase local: `supabase functions serve admin-account`.)
//
// Seguridad:
// - Sin SUPABASE_SERVICE_ROLE_KEY en el entorno, la función responde 503.
// - `eliminar_cuenta` exige un JWT de sesión válido ( Authorization: Bearer
//   <access_token> }): el uid se extrae del propio token verificándolo contra
//   auth.getUser (no se acepta un uid en el cuerpo).
// - `registrar_confirmado` SOLO debería usarse en desarrollo; en producción
//   el flujo normal es signUp + correo de confirmación.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const PROJECT_URL = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('URL') ?? '';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return json(405, { error: 'Método no permitido' });
  }
  if (!SERVICE_KEY || !PROJECT_URL) {
    return json(503, { error: 'Edge Function sin SUPABASE_SERVICE_ROLE_KEY configurada' });
  }

  const admin = createClient(PROJECT_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  let cuerpo: { accion?: string; email?: string; password?: string; nombre?: string };
  try {
    cuerpo = await req.json();
  } catch {
    return json(400, { error: 'Se requiere JSON' });
  }

  const authHeader = req.headers.get('Authorization') ?? '';

  try {
    switch (cuerpo.accion) {
      // ------------------------------------------------------------------
      // 1. Eliminar la cuenta del usuario autenticado
      // ------------------------------------------------------------------
      case 'eliminar_cuenta': {
        const token = authHeader.replace(/^Bearer\s+/i, '');
        if (!token) return json(401, { error: 'Se requiere sesión (Authorization: Bearer)' });

        const { data: quien, error: errQuien } = await admin.auth.getUser(token);
        if (errQuien || !quien?.user) {
          return json(401, { error: 'Token inválido o expirado' });
        }
        const uid = quien.user.id;

        const { error: errDelete } = await admin.auth.admin.deleteUser(uid);
        if (errDelete) {
          return json(respuesta(errDelete.status ?? 500), {
            error: errDelete.message ?? 'No se pudo eliminar la cuenta'
          });
        }
        return json(200, { mensaje: 'Cuenta eliminada', id: uid });
      }

      // ------------------------------------------------------------------
      // 2. Desarrollo/demo: registrar cuenta YA confirmada (sin correo)
      // ------------------------------------------------------------------
      case 'registrar_confirmado': {
        if (Deno.env.get('ALLOW_ADMIN_SIGNUP') !== 'true') {
          return json(403, {
            error: 'Flujo deshabilitado: defina ALLOW_ADMIN_SIGNUP=true solo en desarrollo'
          });
        }
        const email = (cuerpo.email ?? '').trim();
        const password = cuerpo.password ?? '';
        const nombre = (cuerpo.nombre ?? '').trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 8) {
          return json(400, { error: 'Email o contraseña inválidos (mínimo 8)' });
        }
        const { data: creado, error: errCrea } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { nombre, nombre_display: nombre, email }
        });
        if (errCrea) {
          if ((errCrea.message ?? '').includes('already') || errCrea.status === 422) {
            return json(409, { error: 'Correo ya registrado' });
          }
          return json(respuesta(errCrea.status ?? 500), {
            error: errCrea.message ?? 'No se pudo registrar'
          });
        }
        return json(201, {
          mensaje: 'Usuario registrado (ya confirmado)',
          detalle: { id: creado.user?.id, email, nombre, correo_a_confirmar: false }
        });
      }

      default:
        return json(400, { error: 'Acción no reconocida' });
    }
  } catch (e) {
    console.error('admin-account:', e);
    return json(500, { error: 'Error interno de la función' });
  }
});

function respuesta(status: number): number {
  return status >= 400 && status < 600 ? status : 500;
}
