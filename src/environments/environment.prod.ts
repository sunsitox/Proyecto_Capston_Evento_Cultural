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
  production: true,

  supabaseUrl: 'https://ngwkehuewmjykiiujqic.supabase.co',
  supabaseAnonKey: 'sb_publishable_HH26bB4-nDELsrv7Tibjew_Iff1Avtm',

  adminEdgeFunctionUrl: 'https://ngwkehuewmjykiiujqic.supabase.co/functions/v1/admin-account',
  registrarEdgeFunctionUrl: 'https://ngwkehuewmjykiiujqic.supabase.co/functions/v1/registrar-cuenta',

  // Moderación de eventos desde el panel (ver environment.ts).
  adminEventosEdgeFunctionUrl: 'https://ngwkehuewmjykiiujqic.supabase.co/functions/v1/admin-eventos',

  // Publicación de eventos vía Edge Function (ver environment.ts).
  publicarEdgeFunctionUrl: 'https://ngwkehuewmjykiiujqic.supabase.co/functions/v1/publicar-evento',

  // Recuperación desacoplada (ver environment.ts).
  resetRequestEdgeFunctionUrl: 'https://ngwkehuewmjykiiujqic.supabase.co/functions/v1/reset-password-request',
  resetConfirmEdgeFunctionUrl: 'https://ngwkehuewmjykiiujqic.supabase.co/functions/v1/reset-password-confirm'
};
