import { Injectable, computed, inject, Signal } from '@angular/core';
import {
  RecommendationSignal,
  SignalKind,
  UserPreferences
} from '../models/recomendacion.model';
import { PersistenciaRecomendaciones } from './recomendacion-persistencia';
import { SupabaseService } from './supabase.service';

/**
 * Tipo de interacción admitido por la tabla `user_event_interactions`
 * (ver migración `20260924000100_user_recommendation_interactions.sql`).
 */
type TipoInteraccion =
  | 'view_detail'
  | 'open_source'
  | 'open_official_site'
  | 'interested'
  | 'not_interested'
  | 'share'
  | 'report';

/** Señal de la app → columna `interaction_type`. */
const INTERACCION: Record<SignalKind, TipoInteraccion> = {
  ver_detalle: 'view_detail',
  me_interesa: 'interested',
  ver_similares: 'view_detail',
  ver_ubicacion: 'open_source',
  ver_fuente: 'open_official_site',
  no_me_interesa: 'not_interested'
};

/** Columna `interaction_type` → señal (cuando falta `metadata.senal`). */
const SENAL: Record<TipoInteraccion, SignalKind> = {
  view_detail: 'ver_detalle',
  open_source: 'ver_ubicacion',
  open_official_site: 'ver_fuente',
  interested: 'me_interesa',
  not_interested: 'no_me_interesa',
  share: 'me_interesa',
  report: 'no_me_interesa'
};

/** Fila cruda de `user_event_interactions`. */
interface InteraccionRaw {
  interaction_type: string;
  event_id: string;
  occurred_at: string;
  metadata: { senal?: string } | null;
}

/** Máximo de señales que se recuperan por cuenta (las más recientes). */
const LIMITE_SENALES = 1000;

/**
 * Persistencia de la personalización sobre Supabase.
 *
 * - Señales: tabla `user_event_interactions` (RLS: cada usuario ve y escribe
 *   solo sus filas). El `interaction_type` se mapea al enum de la tabla y el
 *   tipo exacto de la app viaja en `metadata.senal` para no perder matices
 *   (por ejemplo "ver_similares", que la tabla agrupa como `view_detail`).
 * - Preferencias declaradas: `user_metadata.recomendaciones` del usuario de
 *   Auth, de modo que sigan a la cuenta en cualquier dispositivo sin exigir
 *   una tabla adicional.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseRecomendacionPersistencia extends PersistenciaRecomendaciones {
  private readonly supabase = inject(SupabaseService);

  readonly usuarioId: Signal<string | null> = computed(
    () => this.supabase.usuario()?.id ?? null
  );

  async cargarSenales(): Promise<RecommendationSignal[]> {
    if (!this.usuarioId()) return [];

    const { data, error } = await this.supabase.cliente
      .from('user_event_interactions')
      .select('interaction_type,event_id,occurred_at,metadata')
      .order('occurred_at', { ascending: true })
      .limit(LIMITE_SENALES);
    if (error) throw error;

    const filas = (data ?? []) as InteraccionRaw[];
    return filas.map((fila) => {
      const guardada = fila.metadata?.senal as SignalKind | undefined;
      const tipo = fila.interaction_type as TipoInteraccion;
      const kind =
        guardada && guardada in INTERACCION
          ? guardada
          : (SENAL[tipo] ?? 'ver_detalle');
      return { kind, eventId: fila.event_id, at: fila.occurred_at };
    });
  }

  async guardarSenal(kind: SignalKind, eventId: string): Promise<void> {
    const userId = this.usuarioId();
    if (!userId) return;

    const { error } = await this.supabase.cliente
      .from('user_event_interactions')
      .insert({
        user_id: userId,
        event_id: eventId,
        interaction_type: INTERACCION[kind],
        metadata: { senal: kind }
      });
    if (error) throw error;
  }

  async borrarSenal(kind: SignalKind, eventId: string): Promise<void> {
    const userId = this.usuarioId();
    if (!userId) return;

    const { error } = await this.supabase.cliente
      .from('user_event_interactions')
      .delete()
      .eq('user_id', userId)
      .eq('event_id', eventId)
      .eq('interaction_type', INTERACCION[kind]);
    if (error) throw error;
  }

  async limpiarSenales(): Promise<void> {
    const userId = this.usuarioId();
    if (!userId) return;

    const { error } = await this.supabase.cliente
      .from('user_event_interactions')
      .delete()
      .eq('user_id', userId);
    if (error) throw error;
  }

  /**
   * Preferencias guardadas en el perfil de Auth. Se leen de la sesión local
   * (`getSession`) para no depender de una llamada de red al arrancar.
   */
  async cargarPreferencias(): Promise<UserPreferences | null> {
    const { data } = await this.supabase.cliente.auth.getSession();
    const meta = data.session?.user.user_metadata as
      | { recomendaciones?: UserPreferences }
      | undefined;
    return meta?.recomendaciones ?? null;
  }

  async guardarPreferencias(prefs: UserPreferences): Promise<void> {
    if (!this.usuarioId()) return;

    const { error } = await this.supabase.cliente.auth.updateUser({
      data: { recomendaciones: prefs }
    });
    if (error) throw error;
  }
}
