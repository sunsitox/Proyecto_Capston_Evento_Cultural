import { Injectable, inject } from '@angular/core';
import { SupabaseService, UsuarioSesion } from './supabase.service';

/**
 * Fachada de sesión de la aplicación.
 *
 * Mantengo la misma superficie pública que usaba el ApiService cuando delegaba
 * en el backend Python (usuario, estaAutenticado, esOrganizador, registrar,
 * ingresar, iniciarOAuth, procesarCallbackOAuth, salir, eliminarCuenta),
 * para que los componentes (login, perfil, auth-callback, publicar) no
 * necesiten cambios por la migración a supabase-js.
 *
 * La carga del catálogo vive en `EventosService` (usa SupabaseService directamente).
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly supabase = inject(SupabaseService);

  // Sesión (delegada)
  readonly usuario = this.supabase.usuario;
  readonly estaAutenticado = this.supabase.estaAutenticado;
  readonly esOrganizador = this.supabase.esOrganizador;
  readonly sesionLista = this.supabase.sesionLista;

  registrar(
    email: string,
    password: string,
    nombre?: string,
    rol: UsuarioSesion['rol'] = 'usuario'
  ) {
    return this.supabase.registrar(email, password, nombre, rol);
  }

  convertirEnOrganizador(): Promise<UsuarioSesion> {
    return this.supabase.convertirEnOrganizador();
  }

  async ingresar(email: string, password: string): Promise<UsuarioSesion> {
    return this.supabase.ingresar(email, password);
  }

  iniciarOAuth(proveedor: 'google' | 'azure' | 'github' = 'google'): void {
    this.supabase
      .iniciarOAuth(proveedor)
      .catch((err: unknown) => console.error('OAuth: no se pudo iniciar el flujo', err));
  }

  recuperarContrasena(email: string): Promise<void> {
    return this.supabase.recuperarContrasena(email);
  }

  actualizarContrasena(nueva: string): Promise<void> {
    return this.supabase.actualizarContrasena(nueva);
  }

  /** Confirma el cambio de contraseña con el token temporal (flujo desacoplado). */
  confirmarResetContrasena(token: string, password: string): Promise<{ email: string }> {
    return this.supabase.confirmarResetContrasena(token, password);
  }

  procesarCallbackOAuth(): Promise<UsuarioSesion | null> {
    return this.supabase.procesarCallbackOAuth();
  }

  salir(): void {
    void this.supabase.salir();
  }

  async eliminarCuenta(): Promise<void> {
    return this.supabase.eliminarCuenta();
  }
}
