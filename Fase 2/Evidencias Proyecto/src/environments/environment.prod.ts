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

  adminEdgeFunctionUrl: 'https://ngwkehuewmjykiiujqic.supabase.co/functions/v1/admin-account'
};
