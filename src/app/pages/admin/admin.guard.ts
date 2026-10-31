import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminAuthService } from '../../core/services/admin-auth.service';

/**
 * Bloquea /v00/admin/* si no hay SESIÓN REAL de administrador:
 * session de Supabase activa + cuenta de correo/contraseña (nunca OAuth) +
 * rol 'admin' en public.profiles. Si algo falla devuelve el árbol de la URL
 * de ingreso ofuscada /v00/admin (acceso interno por URL directa).
 *
 * El propio guard revalida con Supabase en cada navegación: un flag en
 * localStorage no es autoridad (habría sido falsificable desde el cliente).
 */
export const adminGuard: CanActivateFn = async () => {
  const admin = inject(AdminAuthService);
  const router = inject(Router);
  return (await admin.validarSesionActual()) ? true : router.createUrlTree(['/v00/admin']);
};
