/**
 * Capa de recomendaciones — contratos estables preparados para API.
 *
 * En esta maqueta TODO vive en memoria (sin localStorage ni sesión):
 * el backend futuro registrará señales de interés y construirá
 * recomendaciones personalizadas; estos tipos son el punto de
 * integración (mismas formas que se espera del API).
 *
 * Convención de nombres en inglés (Event, RecommendationSignal, …) tal
 * como se especifica para el contrato de la API; el resto de la app usa
 * el modelo `Evento` existente.
 */

import { Evento } from './evento.model';

/** Contrato de evento (subconjunto proyectado del modelo interno `Evento`). */
export interface Event {
  id: string;
  titulo: string;
  categoria: string;
  categorias: string[];
  comuna: string;
  region: string;
  fecha: string;
  gratuito: boolean;
  modalidad: string;
}

/** Tipos de señal de interés que reconoce el sistema. */
export type SignalKind =
  /** Abrir el detalle del evento: interés leve. */
  | 'ver_detalle'
  /** "Me interesa": interés alto. */
  | 'me_interesa'
  /** "Ver similares": interés medio/alto. */
  | 'ver_similares'
  /** Abrir ubicación, cómo llegar o fuente oficial: interés medio. */
  | 'ver_ubicacion'
  /** Página oficial / inscribirse: interés medio-alto. */
  | 'ver_fuente'
  /** "No me interesa": señal negativa; oculta el evento de la vista actual. */
  | 'no_me_interesa';

/** Peso de cada señal para la afinidad mock (rango -1 … 1). */
export const SIGNAL_WEIGHT: Record<SignalKind, number> = {
  ver_detalle: 0.2,
  me_interesa: 1,
  ver_similares: 0.6,
  ver_ubicacion: 0.4,
  ver_fuente: 0.5,
  no_me_interesa: -0.8
};

/** Una interacción del usuario con un evento. */
export interface RecommendationSignal {
  kind: SignalKind;
  eventId: string;
  /** Fecha/hora ISO de la señal (se añade al registrarla). */
  at: string;
}

/**
 * Preferencias de descubrimiento declaradas por la persona
 * (onboarding de Para ti / Preferencias de descubrimiento en Perfil).
 */
export interface UserPreferences {
  categorias: string[];
  regiones: string[];
  comunas: string[];
  /** 'gratis' | 'costo' | 'ambos' */
  precio: 'gratis' | 'costo' | 'ambos';
  /** Presencial, Virtual o Híbrido (vacío = cualquiera). */
  modalidades: string[];
  /** Accesibilidad informada como requisito. */
  accesibilidad: boolean;
  /** Radio de traslado aceptado: 'comuna' | 'region' | 'pais'. */
  alcance: 'comuna' | 'region' | 'pais';
  /** Momentos del día preferidos para asistir (vacío = cualquiera). */
  momentos: ('manana' | 'tarde' | 'noche')[];
}

export const PREFERENCIAS_INICIALES: UserPreferences = {
  categorias: [],
  regiones: [],
  comunas: [],
  precio: 'ambos',
  modalidades: [],
  accesibilidad: false,
  alcance: 'pais',
  momentos: []
};

/**
 * Motivo legible de una recomendación (etiqueta breve que se muestra
 * sobre la tarjeta, p. ej. "Porque exploraste música").
 */
export interface RecommendationReason {
  /** Clave de plantilla para el texto. */
  tipo:
    | 'categoria_explorada'
    | 'preferencia_categoria'
    | 'zona_preferida'
    | 'similar_guardado'
    | 'gratuito'
    | 'tu_region'
    | 'editorial';
  /** Texto ya resuelto para mostrar en la etiqueta. */
  etiqueta: string;
}

/** Una recomendación calculada: evento + motivo + puntaje de afinidad. */
export interface Recommendation {
  evento: EventoLike;
  motivo: RecommendationReason;
  /** Puntaje de afinidad mock (mayor = más relevante). */
  puntaje: number;
}

/** Mínimo estructural que el servicio necesita de un evento. */
export type EventoLike = Evento;
