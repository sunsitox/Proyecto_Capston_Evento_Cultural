/**
 * Environments del proyecto.
 *
 * Para producción ajustar `environment.prod.ts` (o sobreescribir por variables
 * de entorno del sistema de build).
 *
 * La clave `supabaseAnonKey` es PÚBLICA por diseño (Row Level Security goberna
 * el acceso). La clave de servicio NUNCA va aquí: vive solo dentro de la Edge
 * Function admin-account en Supabase.
 */
export const environment = {
  production: false,

  supabaseUrl: 'https://ngwkehuewmjykiiujqic.supabase.co',
  supabaseAnonKey: 'sb_publishable_HH26bB4-nDELsrv7Tibjew_Iff1Avtm',

  adminEdgeFunctionUrl: 'https://ngwkehuewmjykiiujqic.supabase.co/functions/v1/admin-account',

  // Moderación de eventos desde el panel (validados / en validación y
  // visibilidad pública con service_role; ver admin-eventos.service.ts).
  adminEventosEdgeFunctionUrl: 'https://ngwkehuewmjykiiujqic.supabase.co/functions/v1/admin-eventos',

  // Publicación de eventos (INSERT lo hace la Edge Function con service role:
  // la tabla exige external_key/source_id que el cliente no puede generar y
  // el constraint de status no admite 'pending_review'; ver la función).
  publicarEdgeFunctionUrl: 'https://ngwkehuewmjykiiujqic.supabase.co/functions/v1/publicar-evento',

  // Recuperación de contraseña desacoplada: la generación del enlace temporal
  // y el envío del correo viven en Edge Functions propias (el correo sale por
  // el motor externo configurado ahí; Supabase Auth no envía nada).
  resetRequestEdgeFunctionUrl: 'https://ngwkehuewmjykiiujqic.supabase.co/functions/v1/reset-password-request',
  resetConfirmEdgeFunctionUrl: 'https://ngwkehuewmjykiiujqic.supabase.co/functions/v1/reset-password-confirm'
};
