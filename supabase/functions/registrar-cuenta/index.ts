// Edge Function: registrar-cuenta
//
// Registro de usuarios SIN verificación de correo:
//   1. La app hace POST { email, password, nombre, esOrganizador } (público).
//   2. Esta función crea el usuario YA CONFIRMADO con la Admin API
//      (email_confirm: true), así la sesión se abre de inmediato en la app
//      (la verificación por correo activa en el proyecto impide, con signUp
//      normal, iniciar sesión sin confirmar el buzón).
//   3. Envía un correo de "registro exitoso" con el motor externo
//      (Resend HTTP API). Supabase Auth NO envía nada aquí.
//
// Validación espejada del cliente (password-rules.validator.ts) para no crear
// cuentas débiles aunque se llame directo a la función:
//   - formato de correo, 8–72 caracteres, mayúscula, minúscula, número y símbolo.
//
// Despliegue (verificar_jwt DESACTIVADO: es un endpoint público):
//   supabase functions deploy registrar-cuenta \
//     --project-ref ngwkehuewmjykiiujqic --no-verify-jwt
//
// Secretos requeridos (Dashboard → Edge Functions → registrar-cuenta → Secrets;
// reutiliza los mismos valores que función reset-password-request):
//   SUPABASE_SERVICE_ROLE_KEY  (service role del proyecto)
//   RESEND_API_KEY             (API key del motor de correo)
//   RESEND_FROM                (opcional; por defecto onboarding@resend.dev)
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const PROJECT_URL = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('URL') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'Evento Cultural <onboarding@resend.dev>';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
} as Record<string, string>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}

const cuerpoCorreo = (nombre: string): string => `
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px">
  <h2 style="margin:0 0 12px">¡Bienvenido${nombre ? `, ${nombre}` : ''}!</h2>
  <p style="color:#444;line-height:1.6">Tu cuenta en <strong>Evento Cultural</strong> fue creada con éxito
  y ya está activa: puedes iniciar sesión cuando quieras con tu correo y tu contraseña.</p>
  <p style="margin:24px 0">
    <a href="${Deno.env.get('APP_ORIGIN') ?? 'http://localhost:53679'}"
       style="background:#2b6cb0;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;display:inline-block;font-weight:600">
      Descubrir eventos
    </a>
  </p>
  <p style="color:#777;font-size:13px;line-height:1.6">No necesitas confirmar tu correo: la cuenta ya
  quedó verificada al momento del registro.</p>
  <p style="color:#777;font-size:13px">Si no fuiste tú quien creó esta cuenta, puedes ignorar este mensaje.</p>
</div>`;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });

  if (!SERVICE_KEY || !PROJECT_URL) {
    return json(503, { error: 'Edge Function sin SUPABASE_SERVICE_ROLE_KEY configurada' });
  }

  let cuerpo: { email?: string; password?: string; nombre?: string; esOrganizador?: boolean };
  try {
    cuerpo = await req.json();
  } catch {
    return json(400, { error: 'Se requiere JSON' });
  }

  const email = String(cuerpo.email ?? '').trim();
  const password = String(cuerpo.password ?? '');
  const nombre = String(cuerpo.nombre ?? '').trim();
  const esOrganizador = cuerpo.esOrganizador === true;

  // ---- Validación (espejo del cliente) ------------------------------------
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json(400, { error: 'Correo inválido.' });
  }
  if (password.length < 8 || password.length > 72) {
    return json(400, { error: 'La contraseña debe tener entre 8 y 72 caracteres.' });
  }
  const reglasFallidas: string[] = [];
  if (!/[A-Z]/.test(password)) reglasFallidas.push('una mayúscula');
  if (!/[a-z]/.test(password)) reglasFallidas.push('una minúscula');
  if (!/\d/.test(password)) reglasFallidas.push('un número');
  if (!/[^A-Za-z0-9]/.test(password)) reglasFallidas.push('un símbolo');
  if (reglasFallidas.length) {
    return json(400, { error: `La contraseña debe incluir ${reglasFallidas.join(', ')}.` });
  }
  if (nombre.length > 80 || /^\d+$/.test(nombre)) {
    return json(400, { error: 'Nombre inválido.' });
  }
  const rolApp = esOrganizador ? 'organizador' : 'usuario';

  const admin = createClient(PROJECT_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  try {
    // Usuario YA CONFIRMADO: email_confirm evita el paso de verificación y
    // la app abre la sesión de inmediato con signInWithPassword.
    const { data: creado, error: errCrea } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        nombre,
        nombre_display: nombre,
        email,
        rol: rolApp
      }
    });
    if (errCrea) {
      if ((errCrea.message ?? '').includes('already') || errCrea.status === 422) {
        return json(409, { error: 'Este correo ya está registrado. Inicia sesión.' });
      }
      return json(errCrea.status && errCrea.status >= 400 && errCrea.status < 600 ? errCrea.status : 500, {
        error: errCrea.message ?? 'No se pudo registrar la cuenta.'
      });
    }

    // El trigger handle_new_user creó la fila de public.profiles con rol
    // 'visitor'; dejamos el nombre visible consistente con la app.
    if (nombre && creado?.user?.id) {
      await admin.from('profiles').update({ display_name: nombre }).eq('id', creado.user.id);
    }

    // Correo de registro exitoso (best effort: el registro nunca falla por esto).
    if (RESEND_API_KEY) {
      try {
        const envio = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: RESEND_FROM,
            to: [email],
            subject: 'Tu cuenta en Evento Cultural está lista',
            html: cuerpoCorreo(nombre)
          })
        });
        if (!envio.ok) {
          console.error('registrar-cuenta: motor de correo rechazó el envío', envio.status, await envio.text());
        }
      } catch (errCorreo) {
        console.error('registrar-cuenta: falló el envío del correo de bienvenida', errCorreo);
      }
    } else {
      console.error('registrar-cuenta: falta RESEND_API_KEY (cuenta creada, correo NO enviado)');
    }

    return json(201, {
      mensaje: 'Cuenta creada. La app puede abrir la sesión de inmediato.',
      detalle: { id: creado?.user?.id, correo_a_confirmar: false }
    });
  } catch (e) {
    console.error('registrar-cuenta:', e);
    return json(500, { error: 'Error interno de la función' });
  }
});
