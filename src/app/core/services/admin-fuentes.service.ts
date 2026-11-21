import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { SupabaseService } from './supabase.service';

/**
 * Ocultación GLOBAL de páginas de origen (CP-F3-ADM-005).
 *
 * La verdad vive en `public.source_visibility` y la escribe la Edge Function
 * `admin-fuentes` con service_role. Este servicio solo la invoca con el JWT
 * del administrador: la función revalida sesión y rol en el servidor.
 */
@Injectable({ providedIn: 'root' })
export class AdminFuentesService {
  private readonly supabase = inject(SupabaseService);

  /** Oculta o vuelve a mostrar una página en todo el sitio. */
  async definir(fuente: string, oculta: boolean): Promise<string[]> {
    return this.llamar({ accion: 'definir', fuente, oculta });
  }

  /** Reemplaza la nómina completa (acciones «Activar todo»/«Desactivar todo»). */
  async definirTodas(fuentes: string[], oculta: boolean): Promise<string[]> {
    return this.llamar({ accion: 'definir_todas', fuentes, oculta });
  }

  private async llamar(cuerpo: Record<string, unknown>): Promise<string[]> {
    const { data } = await this.supabase.cliente.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Se requiere sesión de administrador.');

    const respuesta = await fetch(environment.adminFuentesEdgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(cuerpo)
    });
    const datos = (await respuesta.json().catch(() => null)) as
      | { error?: string; fuentes?: string[] }
      | null;
    if (!respuesta.ok || !datos) {
      throw new Error(datos?.error || 'No se pudo guardar el cambio.');
    }
    return datos.fuentes ?? [];
  }
}
