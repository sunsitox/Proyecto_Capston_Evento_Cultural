import { Signal } from '@angular/core';
import {
  RecommendationSignal,
  SignalKind,
  UserPreferences
} from '../models/recomendacion.model';

/**
 * Puerto de persistencia de la personalización.
 *
 * El motor de recomendaciones (RecomendacionService) no conoce Supabase:
 * trabaja siempre con este contrato. Así el mismo servicio sigue siendo
 * puramente en memoria cuando no hay sesión (invitados) o en pruebas, y
 * guarda en la cuenta cuando la hay.
 *
 * Se provee en `app.config.ts` con la implementación de Supabase; si no
 * está provisto, `RecomendacionService` funciona solo en memoria.
 */
export abstract class PersistenciaRecomendaciones {
  /** Id del usuario autenticado (null = invitado, no se persiste). */
  abstract readonly usuarioId: Signal<string | null>;

  /** Historial completo de señales de la cuenta, ordenado por fecha. */
  abstract cargarSenales(): Promise<RecommendationSignal[]>;

  abstract guardarSenal(kind: SignalKind, eventId: string): Promise<void>;

  abstract borrarSenal(kind: SignalKind, eventId: string): Promise<void>;

  /** Borra el historial completo ("Reiniciar intereses"). */
  abstract limpiarSenales(): Promise<void>;

  abstract cargarPreferencias(): Promise<UserPreferences | null>;

  abstract guardarPreferencias(prefs: UserPreferences): Promise<void>;
}
