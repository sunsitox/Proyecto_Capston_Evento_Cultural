import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminAuthService } from '../../core/services/admin-auth.service';

/**
 * Bloquea /v00/admin/panel si no hay sesión del panel: devuelve el árbol de
 * la URL de ingreso ofuscada /v00/admin (acceso interno por URL directa).
 */
export const adminGuard: CanActivateFn = () => {
  const admin = inject(AdminAuthService);
  const router = inject(Router);
  return admin.autenticado() ? true : router.createUrlTree(['/v00/admin']);
};
