// Edge Function: reset-password-confirm
//
// Punto final del flujo desacoplado: valida el JWT temporal del enlace
// (firma HS256 + exp contra el reloj), verifica su jti en
// public.password_reset_tokens (un solo uso, no vencido, email coincide)
// y ACTUALIZA LA CONTRASEÑA EN LA BASE DE DATOS vía Admin API
// (auth.users es el único almacén válido de contraseñas; escribirlo
// directo con SQL al schema de auth no es viable ni seguro).
//
// Despliegue (verificar_jwt DESACTIVADO: el usuario llega sin sesión):
//   supabase functions deploy reset-password-confirm \
//     --project-ref ngwkehuewmjykiiujqic --no-verify-jwt
//
// Secretos requeridos (Dashboard → Edge Functions → reset-password-confirm → Secrets):
//   SUPABASE_SERVICE_ROLE_KEY  (service role del proyecto)
//   RECOVERY_JWT_SECRET        (el MISMO secreto que firma reset-password-request)
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const PROJECT_URL = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('URL') ?? '';
const JWT_SECRET = Deno.env.get('RECOVERY_JWT_SECRET') ?? '';

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

const UTF8 = new TextEncoder();

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

function b64uDesdeBytes(bytes: Uint8Array): string {
  let binaria = '';
  for (const b of bytes) binaria += String.fromCharCode(b);
  return btoa(binaria).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** Verifica firma HS256 + exp + typ; devuelve las claims o null. */
async function verificarJwt(
  jwt: string,
  secreto: string
): Promise<Record<string, any> | null> {
  const partes = jwt.split('.');
  if (partes.length !== 3) return null;
  const [header, payload, firma] = partes;
  const esperada = b64uDesdeBytes(
    await firmarHmac(`${header}.${payload}`, secreto)
  );
  if (firma !== esperada) return null;

  let claims: Record<string, any>;
  try {
    claims = JSON.parse(new TextDecoder().decode(bytesDesdeBase64Url(payload)));
  } catch {
    return null;
  }
  // "Cookie" temporal: exp del payload comparada contra el reloj actual.
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) return null;
  if (claims.typ !== 'email-reset-link') return null;
  if (!claims.jti || !claims.sub || !claims.email) return null;
  return claims;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido' });

  if (!SERVICE_KEY || !PROJECT_URL) {
    return json(503, { error: 'Edge Function sin SUPABASE_SERVICE_ROLE_KEY configurada' });
  }
  if (!JWT_SECRET) {
    return json(503, { error: 'Edge Function sin RECOVERY_JWT_SECRET configurada' });
  }

  let cuerpo: { token?: string; password?: string };
  try {
    cuerpo = await req.json();
  } catch {
    return json(400, { error: 'Se requiere JSON' });
  }

  const token = String(cuerpo.token ?? '');
  const password = String(cuerpo.password ?? '');
  if (password.length < 8 || password.length > 72) {
    return json(400, { error: 'La contraseña debe tener entre 8 y 72 caracteres.' });
  }

  const admin = createClient(PROJECT_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  try {
    const claims = await verificarJwt(token, JWT_SECRET);
    if (!claims) {
      return json(400, { error: 'El enlace es inválido o expiró. Solicita una nueva recuperación.' });
    }

    // El JWT firmado solo vale si su jti existe, no venció y no se usó.
    const { data: fila, error: errFila } = await admin
      .from('password_reset_tokens')
      .select('jti, user_id, email, expires_at, used_at')
      .eq('jti', claims.jti)
      .maybeSingle();
    if (errFila) {
      console.error('reset-password-confirm: leyendo token', errFila);
      return json(500, { error: 'Error interno de la función' });
    }
    if (
      !fila ||
      fila.used_at ||
      new Date(fila.expires_at).getTime() <= Date.now() ||
      String(fila.email).toLowerCase() !== String(claims.email).toLowerCase()
    ) {
      return json(400, { error: 'El enlace es inválido o ya se usó. Solicita una nueva recuperación.' });
    }

    // Cambio de contraseña REAL en la base de datos (auth.users, Admin API).
    const { error: errUpdate } = await admin.auth.admin.updateUserById(claims.sub, {
      password,
      email_confirm: true,
      ban_duration: ''
    });
    if (errUpdate) {
      console.error('reset-password-confirm: actualizando usuario', errUpdate);
      return json(500, { error: 'No se pudo guardar la contraseña nueva. Intenta de nuevo.' });
    }

    // Consumir el token (un solo uso) y limpiar tokens pendientes del correo.
    const ahora = new Date().toISOString();
    await admin.from('password_reset_tokens').update({ used_at: ahora }).eq('jti', fila.jti);
    await admin
      .from('password_reset_tokens')
      .delete()
      .eq('email', fila.email)
      .is('used_at', null);

    return json(200, {
      mensaje: 'Contraseña actualizada.',
      email: fila.email
    });
  } catch (e) {
    console.error('reset-password-confirm:', e);
    return json(500, { error: 'Error interno de la función' });
  }
});
