import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';

/** Sesión del panel de administración (identidad que muestra la interfaz). */
export interface SesionAdmin {
  usuario: string;
  email: string;
  rol: string;
}

/** Errores específicos del ingreso al panel (los traduce la página de login). */
export class AdminAccesoError extends Error {
  constructor(
    mensaje: string,
    /** true si la cuenta se rechazó por venir de un proveedor OAuth. */
    readonly porOAuth = false
  ) {
    super(mensaje);
  }
}

/**
 * Sesión del panel de administración con Supabase Auth REAL:
 *
 *  1. El usuario se autentica con su correo y contraseña de Supabase
 *     (signInWithPassword). Ya no existe el par admin/admin del demo.
 *  2. Sólo pasan cuentas creadas con usuario/contraseña: cualquier cuenta
 *     OAuth (Google, etc.) se rechaza aunque en la BD tuviera rol admin,
 *     porque el requisito del panel es acceso interno con credenciales propias.
 *  3. El rol se lee de la BASE DE DATOS (public.profiles.role) y debe ser
 *     exactamente 'admin'. 'visitor' y 'editor' quedan fuera.
 *
 * El estado visible es sólo la identidad para la interfaz; la autoridad
 * siempre es la sesión de Supabase (el guard del panel la revalida en cada
 * navegación, así que un JWT expirado no deja pasar a nadie).
 */
const CLAVE_ROL_ADMIN = 'admin';
const ROL_MOSTRADO = 'Administrador';

@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private readonly supabase = inject(SupabaseService);

  private readonly _sesion = signal<SesionAdmin | null>(null);

  /** Identidad activa del panel (reactiva para el guard y la interfaz). */
  readonly sesion = this._sesion.asReadonly();

  readonly autenticado = computed(() => !!this._sesion());

  /**
   * Valida las credenciales y abre la sesión del panel si todo cumple:
   * contraseña correcta, cuenta NO OAuth y rol 'admin' en profiles.
   * Si algo falla, deja la sesión cerrada y lanza AdminAccesoError.
   */
  async ingresar(email: string, clave: string): Promise<SesionAdmin> {
    await this.cerrarSesionPublica();

    // 1) Autenticación real contra Supabase Auth.
    try {
      await this.supabase.ingresar(email, clave);
    } catch {
      throw new AdminAccesoError('Usuario o contraseña incorrectos.');
    }

    const go = await this.supabase.sesionGoTrue();
    if (!go) {
      throw new AdminAccesoError('No se pudo iniciar la sesión. Intenta de nuevo.');
    }

    // 2) Cuentas OAuth nunca entran al panel, aunque su fila diga admin.
    if (go.proveedor && go.proveedor !== 'email') {
      await this.cerrarSesionPublica();
      throw new AdminAccesoError(
        'Este panel no acepta cuentas de Google (u otro proveedor OAuth). Ingresa con la cuenta de administración.',
        true
      );
    }

    // 3) El rol exigido vive en la base de datos (public.profiles.role).
    const rol = await this.supabase.rolDelPerfil(go.id);
    if (rol !== CLAVE_ROL_ADMIN) {
      await this.cerrarSesionPublica();
      throw new AdminAccesoError(
        'Tu cuenta no tiene el rol de administrador requerido para este panel.'
      );
    }

    const sesion: SesionAdmin = {
      usuario: this.supabase.usuario()?.nombre || go.email.split('@')[0],
      email: go.email,
      rol: ROL_MOSTRADO
    };
    this._sesion.set(sesion);
    return sesion;
  }

  /**
   * Revalida la sesión activa para proteger la ruta del panel: verifica que
   * exista sesión GoTrue, que el proveedor NO sea OAuth y que profiles.role
   * siga siendo 'admin' (se consulta en cada navegación, no se confía en un
   * flag guardado). Si cumple, repuebla la identidad visible y devuelve true.
   */
  async validarSesionActual(): Promise<boolean> {
    const go = await this.supabase.sesionGoTrue();
    if (!go || (go.proveedor && go.proveedor !== 'email')) {
      this._sesion.set(null);
      return false;
    }
    const rol = await this.supabase.rolDelPerfil(go.id);
    if (rol !== CLAVE_ROL_ADMIN) {
      this._sesion.set(null);
      return false;
    }
    if (!this._sesion()) {
      this._sesion.set({
        usuario: this.supabase.usuario()?.nombre || go.email.split('@')[0],
        email: go.email,
        rol: ROL_MOSTRADO
      });
    }
    return true;
  }

  /** Cierra la sesión del panel y de Supabase (borra identidad y JWT). */
  salir(): void {
    void this.cerrarSesionPublica();
  }

  private async cerrarSesionPublica(): Promise<void> {
    this._sesion.set(null);
    try {
      await this.supabase.salir();
    } catch {
      /* la sesión no existía: nada que limpiar */
    }
  }
}
