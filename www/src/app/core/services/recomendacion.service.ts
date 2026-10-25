import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Evento } from '../models/evento.model';
import { PersistenciaRecomendaciones } from './recomendacion-persistencia';
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
 * Motor de señales de interés y afinidad.
 *
 * - Para invitados todo vive en MEMORIA: al recargar la página el estado se
 *   reinicia (no se guarda nada sin cuenta).
 * - Con sesión iniciada, el historial se guarda en la cuenta mediante
 *   `PersistenciaRecomendaciones` (Supabase), de modo que las recomendaciones
 *   sigan a la persona entre dispositivos y recargas.
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

  /**
   * Persistencia opcional: si no está provista (pruebas o invitados) el
   * servicio funciona sólo en memoria.
   */
  private readonly persistencia = inject(PersistenciaRecomendaciones, {
    optional: true
  });

  /** Usuario cuyo historial ya se recuperó (evita recargas repetidas). */
  private usuarioHidratado: string | null = null;

  constructor() {
    const persistencia = this.persistencia;
    if (!persistencia) return;

    // Al iniciar sesión se recupera el historial de la cuenta: así el orden
    // de "Para ti" sigue al usuario en cualquier dispositivo.
    effect(() => {
      const userId = persistencia.usuarioId();
      if (this.usuarioHidratado === userId) return;
      this.usuarioHidratado = userId;

      // Cambió la persona (o se cerró sesión): no se arrastra en memoria el
      // historial de la cuenta anterior. Sólo se limpia lo local; las filas
      // guardadas no se tocan.
      this.limpiarMemoria();
      if (!userId) return;

      void this.hidratarDesdeCuenta(persistencia);
    });
  }

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
        // Todas las categorías del evento descartado, no sólo la principal.
        if (ev) for (const c of ev.categorias) vistos.add(c);
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
    this.persistirSenal(kind, eventId);
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
      this.olvidarSenal('me_interesa', eventId);
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
    this.persistirPreferencias();
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
    this.limpiarCuenta();
  }

  // ------------------------------------------------------------------
  // Persistencia en la cuenta (opcional)
  // ------------------------------------------------------------------

  /** Vacía el estado local sin tocar lo que está guardado en la cuenta. */
  private limpiarMemoria(): void {
    this._senales.set([]);
    this._ocultos.set(new Set());
    this._preferencias.set({ ...PREFERENCIAS_INICIALES });
    this._preferenciasConfiguradas.set(false);
  }

  /**
   * Recupera historial y preferencias de la cuenta y los mezcla con lo que
   * ya se exploró en esta visita (sin duplicar señales).
   */
  private async hidratarDesdeCuenta(
    persistencia: PersistenciaRecomendaciones
  ): Promise<void> {
    // Cada fuente se resuelve por separado: si una falla (sin red, token
    // vencido) la otra igual se aplica.
    const [senales, prefs] = await Promise.all([
      persistencia.cargarSenales().catch((e: unknown) => {
        console.warn('Recomendaciones: no se recuperaron las señales', e);
        return [];
      }),
      persistencia.cargarPreferencias().catch((e: unknown) => {
        console.warn('Recomendaciones: no se recuperaron las preferencias', e);
        return null;
      })
    ]);

    try {
      const clave = (s: RecommendationSignal) => `${s.kind}|${s.eventId}`;
      const unicas = new Map<string, RecommendationSignal>();
      for (const s of this._senales()) unicas.set(clave(s), s);
      for (const s of senales) unicas.set(clave(s), s);

      const lista = [...unicas.values()].sort((a, b) =>
        a.at.localeCompare(b.at)
      );
      this._senales.set(lista);
      this._ocultos.set(
        new Set(
          lista
            .filter((s) => s.kind === 'no_me_interesa')
            .map((s) => s.eventId)
        )
      );

      if (prefs) {
        this._preferencias.set({ ...PREFERENCIAS_INICIALES, ...prefs });
        this._preferenciasConfiguradas.set(true);
      }
    } catch (e) {
      // Sin conexión o sin permisos: la visita continúa en memoria.
      console.warn('Recomendaciones: no se pudo recuperar el historial', e);
    }
  }

  private persistirSenal(kind: SignalKind, eventId: string): void {
    this.persistencia?.guardarSenal(kind, eventId).catch((e: unknown) =>
      console.warn('Recomendaciones: no se pudo guardar la señal', e)
    );
  }

  private olvidarSenal(kind: SignalKind, eventId: string): void {
    this.persistencia?.borrarSenal(kind, eventId).catch((e: unknown) =>
      console.warn('Recomendaciones: no se pudo borrar la señal', e)
    );
  }

  private persistirPreferencias(): void {
    this.persistencia
      ?.guardarPreferencias(this._preferencias())
      .catch((e: unknown) =>
        console.warn('Recomendaciones: no se guardaron las preferencias', e)
      );
  }

  private limpiarCuenta(): void {
    this.persistencia?.limpiarSenales().catch((e: unknown) =>
      console.warn('Recomendaciones: no se reinició el historial remoto', e)
    );
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
    const max = Math.max(0, opciones.max ?? 12);

    const candidatas = eventos.filter(
      (e) => !this._ocultos().has(e.id) && vigenteHasta(e, isoHoy)
    );

    const puntuadas = candidatas.map((evento) => {
      const puntaje = this.puntajeAfinidad(evento);
      return { evento, puntaje, motivo: this.motivoPara(evento, puntaje) };
    });

    // Sin fecha (espacio permanente) ordena al final: la agenda concreta manda.
    const claveFecha = (e: Evento): string => e.fecha || '9999-12-31';

    return puntuadas
      .sort(
        (a, b) =>
          b.puntaje - a.puntaje ||
          claveFecha(a.evento).localeCompare(claveFecha(b.evento))
      )
      .slice(0, max);
  }

  /**
   * Afinidad mock: señales directas + preferencias declaradas
   * (categorías, zona, modalidad, precio, accesibilidad, alcance y
   * momento del día) + proyección desde otros eventos explorados y
   * descuento por categorías descartadas.
   */
  private puntajeAfinidad(e: Evento): number {
    const prefs = this._preferencias();
    let p = 0;

    // 1) Señales directas del evento (incluye negativas).
    p += this.puntajeDe(e.id);

    // 2) Preferencias declaradas: categorías.
    if (e.categorias.some((c) => prefs.categorias.includes(c))) p += 2.2;

    // 3) Zona preferida (región o comuna).
    if (prefs.regiones.includes(e.region) || prefs.comunas.includes(e.comuna)) {
      p += 1.6;
    }

    // 4) Señales hacia otros eventos proyectan afinidad: misma región o
    //    categorías compartidas con eventos explorados. Se cuenta una
    //    sola vez por evento distinto (varias señales sobre el mismo
    //    evento no multiplican la proyección).
    const explorados = new Set<string>();
    for (const s of this._senales()) {
      if (s.kind !== 'no_me_interesa' && s.eventId !== e.id) explorados.add(s.eventId);
    }
    for (const id of explorados) {
      const otro = this.eventoPorId?.(id);
      if (!otro) continue;
      if (otro.region === e.region) p += 0.55;
      if (otro.categorias.some((c) => e.categorias.includes(c))) p += 0.75;
    }

    // 5) Descartes: lo que se apartó con "No me interesa" resta
    //    afinidad a los eventos que comparten sus categorías.
    const descartadas = this.categoriasDescartadas();
    if (e.categorias.some((c) => descartadas.includes(c))) p -= 0.8;

    // 6) Preferencia de precio.
    if (prefs.precio === 'gratis' && e.gratuito) p += 0.5;
    if (prefs.precio === 'costo' && !e.gratuito) p += 0.5;

    // 7) Modalidad declarada: premia la elegida y devalúa el resto.
    if (prefs.modalidades.length > 0) {
      p += prefs.modalidades.includes(e.modalidad) ? 0.8 : -0.8;
    }

    // 8) Accesibilidad como requisito.
    if (prefs.accesibilidad && !!e.accesibilidad) p += 0.4;

    // 9) Alcance de traslado: devalúa eventos fuera del alcance elegido.
    //    'pais' no penaliza. Sólo se compara contra la zona declarada: si
    //    la persona eligió un alcance sin comuna/región de referencia, no
    //    se penaliza nada (evita restar a todo el catálogo).
    if (prefs.alcance === 'region' && prefs.regiones.length > 0) {
      if (!prefs.regiones.includes(e.region)) p -= 1.2;
    }
    if (prefs.alcance === 'comuna' && prefs.comunas.length > 0) {
      if (!prefs.comunas.includes(e.comuna)) p -= 1.8;
    }

    // 10) Momento del día.
    if (prefs.momentos.length > 0 && !this.eventoEnMomentos(e)) p -= 0.9;

    return p;
  }

  /** ¿La hora de inicio del evento cae dentro de los momentos preferidos? */
  private eventoEnMomentos(e: Evento): boolean {
    // Sin hora informada no hay evidencia para penalizar: se deja pasar.
    const match = /^(\d{1,2})/.exec(String(e.hora ?? ''));
    if (!match) return true;
    const hora = Number(match[1]);
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
    if (zonaPorSenal) {
      return {
        tipo: 'zona_preferida',
        etiqueta: `Cerca de eventos que revisaste · ${e.comuna}`
      };
    }

    // Zona declarada en el onboarding (sin señales que la respalden).
    if (prefs.comunas.includes(e.comuna)) {
      return {
        tipo: 'zona_preferida',
        etiqueta: `En tu comuna preferida · ${e.comuna}`
      };
    }
    if (prefs.regiones.includes(e.region)) {
      return { tipo: 'tu_region', etiqueta: `En tu región preferida · ${e.comuna}` };
    }

    // Preferencia de categoría declarada en el onboarding.
    const prefCat = e.categorias.find((c) => prefs.categorias.includes(c));
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

    // Modalidad declarada (presencial, virtual o híbrido).
    if (prefs.modalidades.length > 0 && prefs.modalidades.includes(e.modalidad)) {
      return {
        tipo: 'modalidad_preferida',
        etiqueta: `${e.modalidad}, como prefieres`
      };
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

/**
 * Vigente: fechaTermino (o fecha) es hoy o futuro. Un espacio permanente
 * (museo o centro abierto todo el año, sin fecha) es vigente por
 * definición: su vigencia no termina.
 */
function vigenteHasta(e: Evento, isoHoy: string): boolean {
  if (e.permanente) return true;
  const fin = e.fechaTermino || e.fecha;
  return !!fin && fin >= isoHoy;
}

/** Re-export para uso cómodo desde componentes. */
export type { RecommendationReason, RecommendationSignal, UserPreferences };
