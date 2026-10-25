// Edge Function: reset-password-request
//
// Flujo de recuperación desacoplado del correo de Supabase:
//   1. La app hace POST { email } (público, sin sesión).
//   2. Esta función busca el usuario (Admin API), genera un JWT temporal
//      (HS256, payload en base64 con exp; "cookie" temporal del enlace),
//      guarda su jti en public.password_reset_tokens (un solo uso) y envía
//      el correo con el motor externo (Resend HTTP API). Supabase Auth
//      NO envía nada aquí.
//   3. El enlace apunta a /restablecer-contrasena?token=<JWT>, que abre la
//      pantalla para fijar la contraseña nueva y la envía junto con el
//      token a `reset-password-confirm`.
//
// Despliegue (verificar_jwt DESACTIVADO: es un endpoint público):
//   supabase functions deploy reset-password-request \
//     --project-ref ngwkehuewmjykiiujqic --no-verify-jwt
//
// Secretos requeridos (Dashboard → Edge Functions → reset-password-request → Secrets):
//   SUPABASE_SERVICE_ROLE_KEY  (service role del proyecto)
//   RECOVERY_JWT_SECRET        (secreto propio para firmar el JWT; NO reusar otros)
//   RESEND_API_KEY             (API key del motor de correo)
//   RESEND_FROM                (opcional; por defecto onboarding@resend.dev)
//   APP_ORIGIN                 (opcional; por defecto http://localhost:53679)
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const PROJECT_URL = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('URL') ?? '';
const JWT_SECRET = Deno.env.get('RECOVERY_JWT_SECRET') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_FROM =
  Deno.env.get('RESEND_FROM') ?? 'Evento Cultural <onboarding@resend.dev>';
const APP_ORIGIN = Deno.env.get('APP_ORIGIN') ?? 'http://localhost:53679';

const TTL_MINUTOS = 30;
const MAX_SOLICITUDES_POR_HORA = 3;

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

// ---- JWT HS256 (payload "cookie temporal": se compara exp contra el reloj) ----
const UTF8 = new TextEncoder();

function b64uDesdeBytes(bytes: Uint8Array): string {
  let binaria = '';
  for (const b of bytes) binaria += String.fromCharCode(b);
  return btoa(binaria).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlBytes(json: string): string {
  return b64uDesdeBytes(UTF8.encode(json));
}

function bytesDesdeBase64Url(valor: string): Uint8Array {
  let base64 = valor.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) base64 += '=';
  const binaria = atob(base64);
  const bytes = new Uint8Array(binaria.length);
  for (let i = 0; i < binaria.length; i++) bytes[i] = binaria.charCodeAt(i);
  return bytes;
}

async function firmarHmac(data: string, secreto: string): Promise<Uint8Array> {
  const llave = await crypto.subtle.importKey(
    'raw',
    UTF8.encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const firma = await crypto.subtle.sign('HMAC', llave, UTF8.encode(data));
  return new Uint8Array(firma);
}

async function crearJwt(claims: Record<string, unknown>, secreto: string): Promise<string> {
  const header = base64UrlBytes(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64UrlBytes(JSON.stringify(claims));
  const firma = b64uDesdeBytes(await firmarHmac(`${header}.${payload}`, secreto));
  return `${header}.${payload}.${firma}`;
}

function decodificarPayload(jwt: string): any | null {
  const partes = jwt.split('.');
  if (partes.length !== 3) return null;
  try {
    return JSON.parse(new TextDecoder().decode(bytesDesdeBase64Url(partes[1])));
  } catch {
    return null;
  }
}

const cuerpoCorreo = (enlace: string, minutos: number): string => `
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px">
  <h2 style="margin:0 0 12px">Recupera tu contraseña</h2>
  <p style="color:#444;line-height:1.6">Recibimos una solicitud para crear una contraseña nueva
  en <strong>Evento Cultural</strong>. Este enlace es temporal y de un solo uso
  (vence en <strong>${minutos} minutos</strong>):</p>
  <p style="margin:24px 0">
    <a href="${enlace}" style="background:#2b6cb0;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;display:inline-block;font-weight:600">
      Crear una contraseña nueva
    </a>
  </p>
  <p style="color:#777;font-size:13px;line-height:1.6">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
  <p style="color:#777;font-size:12px;word-break:break-all">${enlace}</p>
  <p style="color:#777;font-size:13px">Si no fuiste tú, ignora este correo y tu contraseña actual sigue vigente.</p>
</div>`;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });

  if (!SERVICE_KEY || !PROJECT_URL) {
    return json(503, { error: 'Edge Function sin SUPABASE_SERVICE_ROLE_KEY configurada' });
  }
  if (!JWT_SECRET) {
    return json(503, { error: 'Edge Function sin RECOVERY_JWT_SECRET configurada' });
  }

  let cuerpo: { email?: string };
  try {
    cuerpo = await req.json();
  } catch {
    return json(400, { error: 'Se requiere JSON' });
  }

  const email = String(cuerpo.email ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json(400, { error: 'Email inválido' });
  }

  const admin = createClient(PROJECT_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // Respuesta genérica: la misma forma pase lo que pase (anti-enumeración).
  const generico = {
    mensaje:
      'Si esta cuenta existe, te enviamos un correo con un enlace temporal para crear una contraseña nueva (vence en ' +
      TTL_MINUTOS +
      ' minutos).'
  };

  try {
    // Higiene: borrar tokens ya expirados.
    await admin
      .from('password_reset_tokens')
      .delete()
      .lt('expires_at', new Date().toISOString());

    // Límite de solicitudes por correo por hora (evita abusos del envío).
    const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from('password_reset_tokens')
      .select('jti', { count: 'exact', head: true })
      .eq('email', email)
      .gt('created_at', haceUnaHora);
    if ((count ?? 0) >= MAX_SOLICITUDES_POR_HORA) return json(200, generico);

    // Buscar el usuario entre los registrados (vigilando el límite de páginas).
    let usuarioId: string | null = null;
    for (let pagina = 1; pagina <= 10 && usuarioId === null; pagina++) {
      const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 });
      if (error) break;
      const encontrado = data.users.find(
        (u: any) => (u.email ?? '').trim().toLowerCase() === email
      );
      if (encontrado) usuarioId = encontrado.id;
      if ((data.users?.length ?? 0) < 200) break;
    }
    if (!usuarioId) return json(200, generico);

    // JWT temporal firmado + jti de un solo uso en la tabla.
    const jti = crypto.randomUUID();
    const ahora = Math.floor(Date.now() / 1000);
    const jwt = await crearJwt(
      { sub: usuarioId, email, jti, typ: 'email-reset-link', iat: ahora, exp: ahora + TTL_MINUTOS * 60 },
      JWT_SECRET
    );
    const { error: errInsert } = await admin.from('password_reset_tokens').insert({
      jti,
      user_id: usuarioId,
      email,
      expires_at: new Date((ahora + TTL_MINUTOS * 60) * 1000).toISOString()
    });
    if (errInsert) {
      console.error('reset-password-request: no se pudo guardar el token', errInsert);
      return json(500, { error: 'No se pudo preparar la recuperación. Intenta de nuevo.' });
    }

    const enlace = `${APP_ORIGIN}/restablecer-contrasena?token=${jwt}`;

    // Motor de correo externo (Resend HTTP API): Supabase Auth no participa.
    if (!RESEND_API_KEY) {
      console.error('reset-password-request: falta RESEND_API_KEY (token creado pero correo NO enviado)');
      return json(200, generico);
    }
    const envio = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [email],
        subject: 'Recupera tu contraseña — Evento Cultural (enlace temporal)',
        html: cuerpoCorreo(enlace, TTL_MINUTOS)
      })
    });
    if (!envio.ok) {
      const detalle = await envio.text();
      console.error('reset-password-request: el motor de correo rechazó el envío', envio.status, detalle);
    }

    return json(200, generico);
  } catch (e) {
    console.error('reset-password-request:', e);
    return json(500, { error: 'Error interno de la función' });
  }
});
