import { Injectable, computed, inject, signal } from '@angular/core';

/** Sesión del panel de administración (identidad que muestra la interfaz). */
export interface SesionAdmin {
  usuario: string;
  rol: string;
}

/**
 * Sesión del panel de administración.
 *
 * PROVISIONAL (fase de demo): credenciales fijas admin/admin y el estado se
 * guarda en localStorage. En producción esto se reemplaza por autenticación
 * real con Supabase Auth (rol 'admin' en user_metadata); el resto del panel
 * ya está desacoplado de este detalle.
 */
const CLAVE_SESION = 'ec_admin_sesion_v1';

/** Credenciales provisionales del panel y el rol que se muestra en la barra. */
const USUARIO_ADMIN = 'admin';
const CLAVE_ADMIN = 'admin';
const ROL_ADMIN = 'Administrador';

@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private readonly _sesion = signal<SesionAdmin | null>(this.leePersistencia());

  /** Identidad activa del panel (reactiva para el guard y la interfaz). */
  readonly sesion = this._sesion.asReadonly();

  readonly autenticado = computed(() => !!this._sesion());

  /** Valida las credenciales provisionales y persiste la sesión si son correctas. */
  ingresar(usuario: string, clave: string): boolean {
    const nombre = usuario.trim();
    const ok = nombre === USUARIO_ADMIN && clave === CLAVE_ADMIN;
    if (ok) {
      this._sesion.set({ usuario: nombre, rol: ROL_ADMIN });
      try {
        localStorage.setItem(CLAVE_SESION, JSON.stringify({ usuario: nombre }));
      } catch {
        /* modo incógnito: la sesión vive sólo en memoria */
      }
    }
    return ok;
  }

  /** Cierra la sesión del panel (borra identidad y bandera). */
  salir(): void {
    this._sesion.set(null);
    try {
      localStorage.removeItem(CLAVE_SESION);
    } catch {
      /* nada que limpiar */
    }
  }

  private leePersistencia(): SesionAdmin | null {
    try {
      const crudo = localStorage.getItem(CLAVE_SESION);
      if (crudo === '1') {
        // Formato antiguo (sólo bandera): se recupera como el usuario demo.
        return { usuario: USUARIO_ADMIN, rol: ROL_ADMIN };
      }
      if (!crudo) return null;
      const datos = JSON.parse(crudo) as { usuario?: string };
      return datos.usuario
        ? { usuario: datos.usuario, rol: ROL_ADMIN }
        : null;
    } catch {
      return null;
    }
  }
}
