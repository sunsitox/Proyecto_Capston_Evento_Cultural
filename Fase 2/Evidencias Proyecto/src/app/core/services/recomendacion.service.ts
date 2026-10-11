import { Injectable, computed, inject, signal } from '@angular/core';
import { Evento } from '../models/evento.model';
import {
  PREFERENCIAS_INICIALES,
  SIGNAL_WEIGHT,
  Recommendation,
  RecommendationReason,
  RecommendationSignal,
  SignalKind,
  UserPreferences
} from '../models/recomendacion.model';

/**
 * Adaptador local de señales de interés (maqueta).
 *
 * - Todo vive en MEMORIA: no persiste en localStorage, sessionStorage ni
 *   base de datos. Tras recargar la página, el estado se reinicia.
 * - Reemplaza al antiguo FavoritosService: no existe "biblioteca
 *   permanente de eventos guardados", sólo señales temporales.
 * - La forma (SignalKind, RecommendationSignal, UserPreferences, …) está
 *   pensada para mapear 1:1 con la futura API de recomendaciones: bastará
 *   sustituir los métodos internos por llamadas HTTP y alimentar
 *   `puntaje`/`motivo` desde el backend.
 */
@Injectable({ providedIn: 'root' })
export class RecomendacionService {
  /** Señales registradas durante esta visita (orden de llegada). */
  private readonly _senales = signal<RecommendationSignal[]>([]);

  /** Ids con "No me interesa" (se ocultan de las vistas actuales). */
  private readonly _ocultos = signal<Set<string>>(new Set());

  /** Preferencias declaradas en el onboarding de Para ti / Perfil. */
  private readonly _preferencias = signal<UserPreferences>({
    ...PREFERENCIAS_INICIALES
  });

  /** Si la persona ya pasó por el onboarding de Para ti. */
  private readonly _preferenciasConfiguradas = signal(false);

  /** Resolver de eventos inyectado por EventosService (para categorías). */
  private eventoPorId?: (id: string) => Evento | undefined;

  readonly senales = this._senales.asReadonly();
  readonly ocultos = this._ocultos.asReadonly();
  readonly preferencias = this._preferencias.asReadonly();
  readonly preferenciasConfiguradas = this._preferenciasConfiguradas.asReadonly();

  /** Total de señales registradas en la visita. */
  readonly totalSenales = computed(() => this._senales().length);

  /** Categorías distintas exploradas vía señales (sin descartes). */
  readonly interesesExplorados = computed(() => {
    const vistos = new Set<string>();
    for (const s of this._senales()) {
      if (s.kind === 'no_me_interesa') continue;
      const ev = this.eventoPorId?.(s.eventId);
      if (ev) {
        for (const c of ev.categorias) vistos.add(c);
      }
    }
    return Array.from(vistos);
  });

  /** Categorías descartadas explícitamente con "No me interesa". */
  readonly categoriasDescartadas = computed(() => {
    const vistos = new Set<string>();
    for (const s of this._senales()) {
      if (s.kind === 'no_me_interesa') {
        const ev = this.eventoPorId?.(s.eventId);
        if (ev) vistos.add(ev.categoria);
      }
    }
    return Array.from(vistos);
  });

  /** Permite al servicio de eventos proveer el resolver de eventos. */
  registrarResolverEventos(fn: (id: string) => Evento | undefined): void {
    this.eventoPorId = fn;
  }

  /**
   * Registra una señal de interés. Es la única puerta de entrada: los
   * componentes no tocan los signals internos.
   */
  registrarSenal(kind: SignalKind, eventId: string): void {
    this._senales.update((lista) => [
      ...lista,
      { kind, eventId, at: new Date().toISOString() }
    ]);
    if (kind === 'no_me_interesa') {
      this._ocultos.update((set) => new Set(set).add(eventId));
    }
  }

  /** Si ya existe una señal concreta para un evento. */
  tieneSenal(eventId: string, kind: SignalKind): boolean {
    return this._senales().some((s) => s.eventId === eventId && s.kind === kind);
  }

  /**
   * Alterna "Me interesa" manteniendo una sola señal de ese tipo por
   * evento (encendido = registrar, apagado = retirar la señal).
   */
  alternarMeInteresa(eventId: string, activo: boolean): void {
    if (activo) {
      if (!this.tieneSenal(eventId, 'me_interesa')) {
        this.registrarSenal('me_interesa', eventId);
      }
    } else {
      this._senales.update((lista) =>
        lista.filter((s) => !(s.eventId === eventId && s.kind === 'me_interesa'))
      );
    }
  }

  /** Ids ocultados con "No me interesa" durante esta visita. */
  ocultados(): string[] {
    return Array.from(this._ocultos());
  }

  /** Si un evento quedó fuera de la vista por "No me interesa". */
  estaOculto(id: string): boolean {
    return this._ocultos().has(id);
  }

  /** Puntaje de afinidad mock acumulado para un evento. */
  puntajeDe(eventId: string): number {
    return this._senales().reduce(
      (total, s) => (s.eventId === eventId ? total + SIGNAL_WEIGHT[s.kind] : total),
      0
    );
  }

  // ------------------------------------------------------------------
  // Preferencias de descubrimiento
  // ------------------------------------------------------------------

  guardarPreferencias(p: Partial<UserPreferences>): void {
    this._preferencias.update((actuales) => ({ ...actuales, ...p }));
    this._preferenciasConfiguradas.set(true);
  }

  reiniciarPreferencias(): void {
    this._preferencias.set({ ...PREFERENCIAS_INICIALES });
    this._preferenciasConfiguradas.set(false);
  }

  /**
   * "Reiniciar intereses de esta visita": borra señales, ocultos y
   * preferencias. Todo vuelve al estado inicial de la maqueta.
   */
  reiniciarVisita(): void {
    this._senales.set([]);
    this._ocultos.set(new Set());
    this._preferencias.set({ ...PREFERENCIAS_INICIALES });
    this._preferenciasConfiguradas.set(false);
  }

  // ------------------------------------------------------------------
  // Afinidad mock
  // ------------------------------------------------------------------

  /**
   * Calcula recomendaciones: vigentes, no descartadas, ordenadas por
   * puntaje mock (señales + preferencias declaradas) y cada una con su
   * motivo legible.
   */
  recomendar(
    eventos: Evento[],
    opciones: { max?: number; fechaRef?: Date } = {}
  ): Recommendation[] {
    const hoy = opciones.fechaRef ?? new Date();
    const isoHoy = fechaISO(hoy);
    const max = opciones.max ?? 12;

    const candidatas = eventos.filter(
      (e) => !this._ocultos().has(e.id) && vigenteHasta(e, isoHoy)
    );

    const puntuadas = candidatas.map((evento) => {
      const puntaje = this.puntajeAfinidad(evento);
      return { evento, puntaje, motivo: this.motivoPara(evento, puntaje) };
    });

    return puntuadas
      .sort(
        (a, b) =>
          b.puntaje - a.puntaje || a.evento.fecha.localeCompare(b.evento.fecha)
      )
      .slice(0, max);
  }

  /**
   * Afinidad mock: señales directas + preferencias declaradas
   * (categorías, zona, precio, accesibilidad) + proyección desde otros
   * eventos explorados.
   */
  private puntajeAfinidad(e: Evento): number {
    let p = 0;

    // 1) Señales directas del evento (incluye negativas).
    p += this.puntajeDe(e.id);

    // 2) Preferencias declaradas: categorías.
    if (this._preferencias().categorias.some((c) => e.categorias.includes(c as never))) {
      p += 2.2;
    }

    // 3) Zona preferida (región o comuna).
    if (
      this._preferencias().regiones.includes(e.region) ||
      this._preferencias().comunas.includes(e.comuna)
    ) {
      p += 1.6;
    }

    // 4) Señales hacia otros eventos proyectan afinidad: misma región o
    //    categorías compartidas con eventos explorados.
    for (const s of this._senales()) {
      if (s.kind === 'no_me_interesa' || s.eventId === e.id) continue;
      const otro = this.eventoPorId?.(s.eventId);
      if (!otro) continue;
      if (otro.region === e.region) p += 0.55;
      if (otro.categorias.some((c) => e.categorias.includes(c))) p += 0.75;
    }

    // 5) Preferencia de precio.
    const precio = this._preferencias().precio;
    if (precio === 'gratis' && e.gratuito) p += 0.5;
    if (precio === 'costo' && !e.gratuito) p += 0.5;

    // 6) Accesibilidad como requisito.
    if (this._preferencias().accesibilidad && !!e.accesibilidad) p += 0.4;

    // 7) Alcance de traslado: devalúa eventos fuera del alcance elegido.
    //    'pais' no penaliza; 'region' baja fuera de la región preferida;
    //    'comuna' baja cualquier comuna distinta de las preferidas.
    const alcance = this._preferencias().alcance;
    if (alcance === 'region' && !this._preferencias().regiones.includes(e.region)) p -= 1.2;
    if (alcance === 'comuna' && !this._preferencias().comunas.includes(e.comuna)) p -= 1.8;

    // 8) Momento del día: booleano según la hora del evento.
    if (this._preferencias().momentos.length > 0 && !this.eventoEnMomentos(e)) p -= 0.9;

    return p;
  }

  /** ¿La hora de inicio del evento cae dentro de los momentos preferidos? */
  private eventoEnMomentos(e: Evento): boolean {
    const hora = Number(String(e.hora ?? '00:00').slice(0, 2)) || 0;
    const momentos = this._preferencias().momentos;
    if (momentos.includes('manana') && hora < 12) return true;
    if (momentos.includes('tarde') && hora >= 12 && hora < 19) return true;
    if (momentos.includes('noche') && hora >= 19) return true;
    return false;
  }

  /**
   * Motivo legible de la recomendación: prioriza la evidencia más
   * concreta (señales) sobre las preferencias declaradas.
   */
  private motivoPara(e: Evento, puntaje: number): RecommendationReason {
    const prefs = this._preferencias();

    // Categoría explorada por señales en eventos similares.
    const explorada = e.categorias.find((c) =>
      this._senales().some(
        (s) =>
          s.kind !== 'no_me_interesa' &&
          s.eventId !== e.id &&
          this.eventoPorId?.(s.eventId)?.categorias.includes(c)
      )
    );
    if (explorada) {
      return {
        tipo: 'categoria_explorada',
        etiqueta: `Porque exploraste ${explorada.toLowerCase()}`
      };
    }

    // Conexión con un único evento revisado: "similar a…".
    const revisados = this._senales().filter(
      (s) => s.kind !== 'no_me_interesa' && s.eventId !== e.id
    );
    if (revisados.length === 1) {
      const otro = this.eventoPorId?.(revisados[0].eventId);
      if (
        otro &&
        (otro.region === e.region ||
          otro.categorias.some((c) => e.categorias.includes(c)))
      ) {
        return {
          tipo: 'similar_guardado',
          etiqueta: 'Similar a un evento que revisaste'
        };
      }
    }

    // Zona: región explorada por señales o declarada en preferencias.
    const zonaPorSenal = this._senales().some(
      (s) =>
        s.kind !== 'no_me_interesa' &&
        s.eventId !== e.id &&
        this.eventoPorId?.(s.eventId)?.region === e.region
    );
    if (zonaPorSenal || prefs.regiones.includes(e.region)) {
      return {
        tipo: 'zona_preferida',
        etiqueta: `Cerca de eventos que revisaste · ${e.comuna}`
      };
    }

    // Preferencia de categoría declarada en el onboarding.
    const prefCat = e.categorias.find((c) => prefs.categorias.includes(c as never));
    if (prefCat) {
      return {
        tipo: 'preferencia_categoria',
        etiqueta: `Dijiste que te interesa ${prefCat.toLowerCase()}`
      };
    }

    // Gratuitos cuando hay preferencia de precio.
    if (prefs.precio === 'gratis' && e.gratuito) {
      return { tipo: 'gratuito', etiqueta: 'Gratis, como prefieres' };
    }

    // Editorial: llenar con eventos vigentes de la agenda.
    if (puntaje > 0) {
      return { tipo: 'editorial', etiqueta: 'Destacado de la agenda cultural' };
    }
    return { tipo: 'editorial', etiqueta: 'De la agenda cultural de esta semana' };
  }
}

/** yyyy-mm-dd en horario local. */
function fechaISO(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Vigente: fechaTermino (o fecha) es hoy o futuro. */
function vigenteHasta(e: Evento, isoHoy: string): boolean {
  return (e.fechaTermino ?? e.fecha) >= isoHoy;
}

/** Re-export para uso cómodo desde componentes. */
export type { RecommendationReason, RecommendationSignal, UserPreferences };
