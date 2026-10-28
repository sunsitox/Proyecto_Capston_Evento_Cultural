import { inject } from '@angular/core';
import { Injectable, signal, computed } from '@angular/core';
import {
  CategoriaEvento,
  EstadoEvento,
  Evento,
  ModalidadEvento
} from '../models/evento.model';
import { MOCK_EVENTOS, PUNTO_REFERENCIA } from '../../data/mock-eventos';
import { SupabaseService } from './supabase.service';
import { RecomendacionService } from './recomendacion.service';

export type OrdenEventos =
  | 'fecha'
  | 'nombre'
  | 'categoria'
  | 'cercania'
  | 'actualizacion';

export interface FiltrosEventos {
  texto: string;
  /** Categorías múltiples: se combinan con "O" */
  categorias: string[];
  region: string | null;
  comuna: string | null;
  /** Rango de fechas (ISO yyyy-mm-dd) */
  fechaDesde: string | null;
  fechaHasta: string | null;
  gratuito: boolean | null;
  /** Presencial, Virtual o Híbrido */
  modalidad: string | null;
  /** Público objetivo */
  publico: string | null;
  /** Solo eventos con información de accesibilidad */
  accesible: boolean;
}

export const FILTROS_INICIALES: FiltrosEventos = {
  texto: '',
  categorias: [],
  region: null,
  comuna: null,
  fechaDesde: null,
  fechaHasta: null,
  gratuito: null,
  modalidad: null,
  publico: null,
  accesible: false
};

/** Llave en localStorage con las páginas/fuentes ocultas desde el panel. */
const EVENTOS_FUENTES_OCULTAS = 'ec_fuentes_ocultas_v1';

/** Opción de filtro con la cantidad de eventos que quedarían al elegirla. */
export interface OpcionFiltro {
  valor: string;
  total: number;
}

/**
 * Catálogo de opciones disponibles con su conteo real.
 *
 * Cada lista se calcula con TODOS los filtros aplicados menos el propio:
 * si el usuario filtra por región, las categorías siguen mostrando cuántos
 * eventos hay en esa región.
 */
export interface FacetasEventos {
  /** Eventos vigentes (catálogo completo, sin filtros). */
  total: number;
  categorias: OpcionFiltro[];
  regiones: OpcionFiltro[];
  /** Comunas de la región elegida (o todas si no hay región). */
  comunas: OpcionFiltro[];
  modalidades: OpcionFiltro[];
  publicos: OpcionFiltro[];
  gratuitos: number;
  conCosto: number;
  accesibles: number;
}

@Injectable({ providedIn: 'root' })
export class EventosService {
  private readonly supabase = inject(SupabaseService);
  private readonly recomendacion = inject(RecomendacionService);
  private readonly _eventos = signal<Evento[]>(MOCK_EVENTOS);
  private readonly _filtros = signal<FiltrosEventos>({ ...FILTROS_INICIALES });
  private readonly _ordenPor = signal<OrdenEventos>('fecha');
  private readonly _cargando = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);
  /** Promesa de la carga en curso (evita descargas simultáneas entre páginas). */
  private cargaEnCurso?: Promise<void>;

  constructor() {
    // DEF-QA-011: sin resolver, Perfil siempre veía 0 intereses aunque
    // Para ti sí usara las señales (el servicio no podía mapear id→evento).
    this.recomendacion.registrarResolverEventos((id) => this.obtenerPorId(id));
  }

  readonly eventos = this._eventos.asReadonly();
  readonly filtros = this._filtros.asReadonly();
  readonly ordenPor = this._ordenPor.asReadonly();
  readonly cargando = this._cargando.asReadonly();
  readonly error = this._error.asReadonly();

  /** Fecha ISO local de hoy (yyyy-mm-dd). */
  static hoyISO(): string {
    const d = new Date();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const dia = `${d.getDate()}`.padStart(2, '0');
    return `${d.getFullYear()}-${m}-${dia}`;
  }

  /**
   * Eventos VIGENTES (aún no terminan): los datos rotan y vencen,
   * nunca se muestran eventos pasados.
   *
   * - Un evento SIN término ya vencido (fecha cruda antigua sin rango)
   *   queda fuera: sería visible en el catálogo pero bloqueado en la ficha.
   * - Los espacios permanentes (museos, centros abiertos todo el año) no
   *   tienen fecha y siguen vigentes.
   */
  readonly eventosVigentes = computed(() => {
    const hoy = EventosService.hoyISO();
    return this._eventos()
      .filter((e) => {
        if (e.permanente) return true;
        if (!e.fechaTermino) return !e.fecha || e.fecha >= hoy;
        return e.fechaTermino >= hoy;
      })
      // Páginas ocultas desde el panel de administración: sus eventos
      // desaparecen de TODO el catálogo (sitio público incluido).
      .filter((e) => !this._fuentesOcultas().has(e.fuente));
  });

  /** Catálogo SIN filtrar (todo lo cargado), para administración/paneles. */
  readonly catalogoCompleto = computed(() => this._eventos());

  /**
   * Páginas (fuentes de extracción) ocultas por el administrador.
   *
   * Se guardan en localStorage del navegador donde se administran: la
   * ocultación ya es efectiva para todo el catálogo en ese entorno. Para
   * aplicarla a todos los visitantes conviene una tabla en Supabase con Edge
   * Function (service_role), igual que las preferencias agregadas.
   */
  private readonly _fuentesOcultas = signal<Set<string>>(EventosService.leerFuentesOcultas());

  /** Nombres de fuente excluidos del catálogo. */
  readonly fuentesOcultas = this._fuentesOcultas.asReadonly();

  /** Oculta o vuelve a mostrar una página/fuente en todo el catálogo. */
  ocultarFuente(fuente: string, ocultar: boolean): void {
    if (!fuente || !fuente.trim()) return;
    const lista = new Set(this._fuentesOcultas());
    if (ocultar) lista.add(fuente);
    else lista.delete(fuente);
    this._fuentesOcultas.set(lista);
    try {
      localStorage.setItem(EVENTOS_FUENTES_OCULTAS, JSON.stringify([...lista]));
    } catch {
      /* sin almacenamiento disponible, el ajuste vive solo en memoria */
    }
  }

  /**
   * Reemplaza la nómina COMPLETA de páginas ocultas de una vez (acción de
   * lote "activar todo / desactivar todo"): una sola escritura persistente.
   */
  definirFuentesOcultas(fuentes: readonly string[]): void {
    const lista = new Set(fuentes.filter((f) => f && f.trim()));
    this._fuentesOcultas.set(lista);
    try {
      localStorage.setItem(EVENTOS_FUENTES_OCULTAS, JSON.stringify([...lista]));
    } catch {
      /* sin almacenamiento disponible, el ajuste vive solo en memoria */
    }
  }

  private static leerFuentesOcultas(): Set<string> {
    try {
      const guardadas: unknown = JSON.parse(
        localStorage.getItem(EVENTOS_FUENTES_OCULTAS) ?? '[]'
      );
      return new Set(
        Array.isArray(guardadas)
          ? guardadas.filter((x): x is string => typeof x === 'string')
          : []
      );
    } catch {
      return new Set();
    }
  }

  readonly eventosFiltrados = computed(() => {
    const f = this._filtros();
    return this.ordenar(
      this.eventosVigentes().filter((evento) => this.coincide(evento, f)),
      this._ordenPor()
    );
  });

  /**
   * Predicado único de coincidencia.
   *
   * `omitir` permite evaluar todos los filtros menos uno: así se cuentan
   * las opciones (facetas) sin que el propio criterio las reduzca a cero.
   */
  private coincide(
    evento: Evento,
    f: FiltrosEventos,
    omitir: ReadonlyArray<keyof FiltrosEventos> = []
  ): boolean {
    const aplica = (clave: keyof FiltrosEventos) => !omitir.includes(clave);
    const busqueda = f.texto.trim().toLowerCase();

    const coincideTexto =
      !aplica('texto') ||
      !busqueda ||
      evento.titulo.toLowerCase().includes(busqueda) ||
      evento.comuna.toLowerCase().includes(busqueda) ||
      evento.region.toLowerCase().includes(busqueda) ||
      evento.descripcion.toLowerCase().includes(busqueda) ||
      evento.organizador.toLowerCase().includes(busqueda) ||
      evento.categorias.some((c) => c.toLowerCase().includes(busqueda));

    const coincideCategorias =
      !aplica('categorias') ||
      f.categorias.length === 0 ||
      evento.categorias.some((c) => f.categorias.includes(c));

    const coincideRegion =
      !aplica('region') || !f.region || evento.region === f.region;
    const coincideComuna =
      !aplica('comuna') || !f.comuna || evento.comuna === f.comuna;

    const inicio = evento.fecha;
    const fin = evento.fechaTermino ?? evento.fecha;
    // Los espacios permanentes rigen siempre: ningún rango los excluye.
    const coincideDesde =
      evento.permanente ||
      !aplica('fechaDesde') ||
      !f.fechaDesde ||
      fin >= f.fechaDesde;
    const coincideHasta =
      evento.permanente ||
      !aplica('fechaHasta') ||
      !f.fechaHasta ||
      inicio <= f.fechaHasta;

    const coincideGratuito =
      !aplica('gratuito') || f.gratuito === null || evento.gratuito === f.gratuito;
    const coincideModalidad =
      !aplica('modalidad') || !f.modalidad || evento.modalidad === f.modalidad;
    const coincidePublico =
      !aplica('publico') || !f.publico || evento.publico === f.publico;
    const coincideAccesible =
      !aplica('accesible') || !f.accesible || !!evento.accesibilidad;

    return (
      coincideTexto &&
      coincideCategorias &&
      coincideRegion &&
      coincideComuna &&
      coincideDesde &&
      coincideHasta &&
      coincideGratuito &&
      coincideModalidad &&
      coincidePublico &&
      coincideAccesible
    );
  }

  // ------------------------------------------------------------------
  // Facetas: opciones disponibles y cuántos eventos tiene cada una
  // ------------------------------------------------------------------

  /** Opciones del catálogo con sus contadores, según los filtros activos. */
  readonly facetas = computed<FacetasEventos>(() =>
    this.facetasPara(this._filtros())
  );

  /**
   * Cuenta las opciones de cada filtro para un estado de filtros dado
   * (la sidebar usa los filtros aplicados; el bottom sheet, su borrador).
   */
  facetasPara(f: FiltrosEventos): FacetasEventos {
    const vigentes = this.eventosVigentes();
    const base = (omitir: ReadonlyArray<keyof FiltrosEventos>) =>
      vigentes.filter((evento) => this.coincide(evento, f, omitir));
    const sinPrecio = base(['gratuito']);

    return {
      total: vigentes.length,
      categorias: contarOpciones(base(['categorias']), (e) => e.categorias),
      regiones: contarOpciones(base(['region', 'comuna']), (e) => [e.region]),
      comunas: contarOpciones(base(['comuna']), (e) => [e.comuna]),
      modalidades: contarOpciones(base(['modalidad']), (e) => [e.modalidad]),
      publicos: contarOpciones(base(['publico']), (e) => [e.publico]),
      gratuitos: sinPrecio.filter((e) => e.gratuito).length,
      conCosto: sinPrecio.filter((e) => !e.gratuito).length,
      accesibles: base(['accesible']).filter((e) => !!e.accesibilidad).length
    };
  }

  /** Catálogo territorial real: región → comunas con eventos. */
  readonly comunasPorRegion = computed<Map<string, OpcionFiltro[]>>(() => {
    const conteo = new Map<string, Map<string, number>>();
    for (const evento of this.eventosVigentes()) {
      const comunas = conteo.get(evento.region) ?? new Map<string, number>();
      comunas.set(evento.comuna, (comunas.get(evento.comuna) ?? 0) + 1);
      conteo.set(evento.region, comunas);
    }
    const catalogo = new Map<string, OpcionFiltro[]>();
    for (const [region, comunas] of conteo) {
      catalogo.set(
        region,
        ordenarOpciones(
          [...comunas.entries()].map(([valor, total]) => ({ valor, total }))
        )
      );
    }
    return catalogo;
  });

  /** Comunas con eventos de una región (independiente de los filtros activos). */
  comunasDe(region: string | null): OpcionFiltro[] {
    if (!region) return [];
    return this.comunasPorRegion().get(region) ?? [];
  }

  /**
   * Regiones presentes en el catálogo vigente, con su cantidad de eventos.
   *
   * Las etiquetas salen de los propios eventos (p. ej. "Región de
   * Valparaíso"): el onboarding de Para ti debe guardar exactamente el
   * mismo texto que luego compara el motor de recomendaciones.
   */
  readonly regionesDisponibles = computed<OpcionFiltro[]>(() => {
    const conteo = new Map<string, number>();
    for (const evento of this.eventosVigentes()) {
      const region = evento.region || 'Sin región';
      conteo.set(region, (conteo.get(region) ?? 0) + 1);
    }
    return ordenarOpciones(
      [...conteo.entries()].map(([valor, total]) => ({ valor, total }))
    );
  });

  /**
   * Cuántos eventos vigentes coinciden con un estado de filtros dado.
   * Lo usa el bottom sheet para anticipar el resultado antes de aplicar.
   */
  contarCoincidencias(f: FiltrosEventos): number {
    return this.eventosVigentes().filter((evento) =>
      this.coincide(evento, f)
    ).length;
  }

  actualizarFiltros(parciales: Partial<FiltrosEventos>): void {
    this._filtros.update((actuales) => ({ ...actuales, ...parciales }));
  }

  /** Reemplaza el estado completo de filtros (bottom sheet "Aplicar"). */
  reemplazarFiltros(filtros: FiltrosEventos): void {
    this._filtros.set({ ...filtros });
  }

  /** Quita UN filtro individual (chips activos) */
  quitarFiltro(clave: string): void {
    switch (clave) {
      case 'texto':
        this.actualizarFiltros({ texto: '' });
        break;
      case 'categorias':
        this.actualizarFiltros({ categorias: [] });
        break;
      case 'region':
        this.actualizarFiltros({ region: null });
        break;
      case 'comuna':
        this.actualizarFiltros({ comuna: null });
        break;
      case 'fechaDesde':
        this.actualizarFiltros({ fechaDesde: null });
        break;
      case 'fechaHasta':
        this.actualizarFiltros({ fechaHasta: null });
        break;
      case 'gratuito':
        this.actualizarFiltros({ gratuito: null });
        break;
      case 'modalidad':
        this.actualizarFiltros({ modalidad: null });
        break;
      case 'publico':
        this.actualizarFiltros({ publico: null });
        break;
      case 'accesible':
        this.actualizarFiltros({ accesible: false });
        break;
      default:
        // Chips individuales de categoría: 'cat:Nombre'
        if (clave.startsWith('cat:')) {
          const cat = clave.slice(4);
          this.actualizarFiltros({
            categorias: this.filtros().categorias.filter((c) => c !== cat)
          });
        }
        break;
    }
  }

  limpiarFiltros(): void {
    this._filtros.set({ ...FILTROS_INICIALES });
  }

  /**
   * Limpia todos los filtros excepto los indicados (p. ej. al llegar a
   * Descubrir desde "Ver similares", conservando la categoría).
   */
  limpiarOtrosFiltros(
    mantener: keyof FiltrosEventos | Array<keyof FiltrosEventos>
  ): void {
    const claves = Array.isArray(mantener) ? mantener : [mantener];
    const actuales = { ...FILTROS_INICIALES } as FiltrosEventos;
    for (const clave of claves) {
      (actuales as unknown as Record<string, unknown>)[clave] = (
        this._filtros() as unknown as Record<string, unknown>
      )[clave];
    }
    this._filtros.set(actuales);
  }

  setOrden(orden: OrdenEventos): void {
    this._ordenPor.set(orden);
  }

  private ordenar(lista: Evento[], orden: OrdenEventos): Evento[] {
    const copia = [...lista];
    // Los permanentes (sin fecha) van al final, no se cuelan primero por "".
    const clave = (e: Evento): string => `${e.fecha || '9999-12-31'}T${e.hora}`;
    switch (orden) {
      case 'nombre':
        return copia.sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
      case 'categoria':
        return copia.sort(
          (a, b) =>
            a.categoria.localeCompare(b.categoria, 'es') ||
            clave(a).localeCompare(clave(b))
        );
      case 'cercania':
        return copia.sort((a, b) => distanciaKm(a) - distanciaKm(b));
      case 'actualizacion':
        return copia.sort(
          (a, b) =>
            b.ultimaComprobacion.localeCompare(a.ultimaComprobacion) ||
            clave(a).localeCompare(clave(b))
        );
      case 'fecha':
      default:
        return copia.sort((a, b) => clave(a).localeCompare(clave(b)));
    }
  }

  obtenerPorId(id: string): Evento | undefined {
    return this._eventos().find((e) => e.id === id);
  }

  /** Simula la creación de un evento nuevo (no persiste, sólo demo visual) */
  publicarEvento(evento: Evento): void {
    this._eventos.update((lista) => [evento, ...lista]);
  }

  /**
   * Publica el evento vía la Edge Function `publicar-evento` (ver
   * SupabaseService.publicarEvento: INSERT con service_role tras revalidar
   * el JWT y el rol organizador).
   */
  async publicarSupabase(draft: {
    title: string;
    description: string;
    start_at: string;
    end_at: string | null;
    address: string;
    venue: string;
    is_free: boolean;
    price_text: string | null;
    image_url: string;
    audience: string;
    comuna?: string;
    modalidad?: string;
    official_url?: string;
    categories: (string | null)[];
  }): Promise<void> {
    await this.supabase.publicarEvento(draft);
  }

  /** Todos los eventos vigentes, sin filtros (calendario, mapa, similares). */
  obtenerVigentes(): Evento[] {
    return this.eventosVigentes();
  }

  /** Eventos vigentes de una fecha específica (calendario). */
  obtenerPorFecha(fechaISO: string): Evento[] {
    const vigentes = this.eventosVigentes();
    return vigentes
      .filter(
        (e) =>
          !e.permanente &&
          e.fecha <= fechaISO &&
          (e.fechaTermino ?? e.fecha) >= fechaISO
      )
      .sort((a, b) => `${a.fecha}T${a.hora}`.localeCompare(`${b.fecha}T${b.hora}`));
  }

  /** Fechas ISO vigentes con al menos un evento (para marcar el calendario). */
  fechasConEventos(): string[] {
    const hoy = EventosService.hoyISO();
    const fechas = new Set<string>();
    for (const e of this.eventosVigentes()) {
      // Los permanentes no marcan días: su vigencia es indefinida.
      if (e.permanente) continue;
      if (e.fechaTermino && e.fechaTermino < hoy) continue;
      const inicio = new Date(`${e.fecha}T00:00:00`);
      const fin = new Date(`${(e.fechaTermino ?? e.fecha)}T00:00:00`);
      for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
        fechas.add(
          `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`
        );
      }
    }
    return Array.from(fechas);
  }

  /**
   * Simula una carga fallida (probable no vigencia de datos) para
   * demostrar el estado de error de la interfaz.
   */
  setError(mensaje: string | null): void {
    this._error.set(mensaje);
  }

  /**
   * Carga el catálogo desde Supabase EN LOTES (progressive loading): el
   * primer lote (~150 eventos) pinta de inmediato y libera el spinner;
   * el resto llega solicitar-bloque-solicitar en segundo plano y se va
   * concatenando, así ninguna lista espera los 900+ de una vez.
   * Si falla, se conservan los eventos de demostración y se avisa.
   */
  async cargarEventos(): Promise<void> {
    // Un solo catálogo en vuelo: si otra página pide recarga mientras la
    // progresiva corre, comparten la misma promesa (y no se intercalan lotes).
    if (this.cargaEnCurso) return this.cargaEnCurso;
    this.cargaEnCurso = this.descargarCatalogo().finally(() => {
      this.cargaEnCurso = undefined;
    });
    return this.cargaEnCurso;
  }

  private async descargarCatalogo(): Promise<void> {
    this._cargando.set(true);
    this._error.set(null);
    const acumulados: Evento[] = [];
    let hayPrimerLote = false;
    try {
      // El mapa de comunas llega por su propio callback ANTES del primer
      // lote: el callback de lotes corre mientras `catalogo()` aún no
      // resuelve, así no puede leer valores del return.
      let comunas: Map<string, { id: string; name: string; region: string | null }> =
        new Map();
      const { eventos } = await this.supabase.catalogo((lote) => {
        if (lote.length === 0) return;
        const mapeados = lote.map((raw) => this.desdeApi(raw, comunas));
        acumulados.push(...mapeados);
        if (!hayPrimerLote) {
          hayPrimerLote = true;
          // Primer bloque: reemplaza los mocks y apaga el spinner para que
          // el listado pinte ya, mientras el resto descarga en segundo plano.
          this._cargando.set(false);
          this._eventos.set(mapeados);
        } else {
          this._eventos.update((actuales) => [...actuales, ...mapeados]);
        }
      }, (mapa) => {
        comunas = mapa;
      });
      if (eventos.length === 0) {
        this._error.set('Supabase respondió sin eventos. Se muestran eventos de demostración.');
        return;
      }
      // Estado final coherente: la lista completa en el orden del servidor.
      this._eventos.set(acumulados);
    } catch {
      this._error.set(
        hayPrimerLote
          ? 'La carga se interrumpió a mitad del catálogo (se muestran los eventos que llegaron).'
          : 'No se pudo conectar con Supabase. Se muestran eventos de demostración.'
      );
    } finally {
      this._cargando.set(false);
    }
  }

  /** Traduce una fila de Supabase (types de SupabaseService) al modelo de la interfaz. */
  private desdeApi(
    e: {
      id: string;
      title: string | null;
      description: string | null;
      image_url: string | null;
      start_at: string | null;
      end_at: string | null;
      venue: string | null;
      address: string | null;
      city: string | null;
      region: string | null;
      audience: string | null;
      is_free: boolean | null;
      price_text: string | null;
      official_url: string | null;
      source_url: string | null;
      latitude: number | null;
      longitude: number | null;
      created_at: string | null;
      updated_at: string | null;
      last_seen_at: string | null;
      commune_id: string | null;
      categorias: string[];
    },
    comunas: Map<string, { id: string; name: string; region: string | null }>
  ): Evento {
    const categorias = e.categorias.filter((c) => c && c.trim() !== '');
    const lat = Number(e.latitude);
    const lng = Number(e.longitude);
    const coordenadas =
      Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0
        ? { lat, lng }
        : undefined;
    const enlace = enlaceEspecifico(e.official_url, e.source_url);
    const inicio = (e.start_at || '').slice(0, 10);
    let termino = (e.end_at || '').slice(0, 10);
    const comuna = e.commune_id ? comunas.get(e.commune_id) : undefined;
    // DEF-QA-007 (actualizado): un rango de años (p. ej. 2019→2031) es un
    // espacio PERMANENTE (museo, centro cultural abierta gran parte del año),
    // no un evento con fecha/horario. Se marca `permanente` y se descartan
    // ambas fechas: antes quedaba la fecha cruda "1 ene 2019" y la ficha la
    // bloqueaba como vencida. Sin fechas no se puede calcular "ya venció".
    let permanente = false;
    if (inicio && termino) {
      const dias =
        (new Date(`${termino}T00:00:00`).getTime() -
          new Date(`${inicio}T00:00:00`).getTime()) /
        86_400_000;
      if (Number.isFinite(dias) && dias > 366) {
        permanente = true;
        termino = '';
      }
    }
    const horaInicioRaw = (e.start_at || '').slice(11, 16);
    const horaInicio = permanente ? '' : horaInicioRaw;
    const horaTerminoRaw = (e.end_at || '').slice(11, 16);
    const horaTermino = permanente ? '' : horaTerminoRaw;

    return {
      id: e.id,
      titulo: e.title || 'Evento sin título',
      descripcion: e.description || '',
      imagen: e.image_url || 'assets/icon/favicon.png',
      fecha: permanente ? '' : inicio,
      fechaTermino: termino || undefined,
      permanente: permanente || undefined,
      hora: horaInicio || '',
      horaTermino: horaTermino || undefined,
      recinto: e.venue || e.address || '',
      direccion: e.address || '',
      comuna: comuna?.name || e.city || 'Sin comuna',
      region: e.region || comuna?.region || 'Sin región',
      modalidad: (e.venue || e.address || e.city ? 'Presencial' : 'Virtual') as ModalidadEvento,
      categoria: (categorias[0] ?? 'Otros') as CategoriaEvento,
      categorias: categorias as CategoriaEvento[],
      organizador: 'Organizador no informado',
      precio: e.price_text || '',
      gratuito: !!e.is_free,
      publico: (e.audience || '').trim() || 'Todo público',
      accesibilidad: undefined,
      fuente: dominioDe(enlace),
      paginaOficial: enlace || undefined,
      enlaceInscripcion: enlace || undefined,
      ultimaComprobacion:
        (e.updated_at || e.last_seen_at || e.created_at || '').slice(0, 10) ||
        EventosService.hoyISO(),
      estado: permanente ? 'en_curso' : estadoDe(inicio, termino),
      coordenadas
    };
  }
}

/**
 * Estado del evento según sus fechas (hoy / en curso / próximo).
 * Los espacios permanentes se muestran como "en curso": su vigencia no
 * termina, no son "próximos".
 */
function estadoDe(inicio: string, termino: string, permanente?: boolean): EstadoEvento {
  if (permanente) return 'en_curso';
  const hoy = EventosService.hoyISO();
  if (!inicio) return 'proximo';
  if (termino && inicio <= hoy && termino >= hoy) return 'en_curso';
  if (inicio === hoy) return 'hoy';
  return 'proximo';
}

/**
 * Elegir el enlace más específico para la ficha.
 *
 * `official_url` suele ser el sitio genérico del recinto (ej.
 * "http://www.unap.cl") mientras `source_url` apunta a la publicación
 * concreta del evento (ej. "chilecultura.gob.cl/events/341/"). Se prefiere
 * la URL con página específica (path más allá de la raíz) para que el
 * botón de inscripción/fuente lleve a la publicación y no a la portada.
 */
function enlaceEspecifico(
  official_url: string | null,
  source_url: string | null
): string {
  const oficial = (official_url ?? '').trim();
  const fuente = (source_url ?? '').trim();
  const especifica = (url: string): boolean => {
    try {
      const u = new URL(url);
      return u.pathname.length > 1 || u.search.length > 0 || u.hash.length > 0;
    } catch {
      return false;
    }
  };
  if (especifica(oficial)) return oficial;
  if (especifica(fuente)) return fuente;
  return oficial || fuente;
}

/** Nombre legible de la fuente a partir de su enlace (sin el www). */
function dominioDe(enlace: string): string {
  if (!enlace) return 'Información compilada';
  try {
    return new URL(enlace).hostname.replace(/^www\./, '');
  } catch {
    return 'Información compilada';
  }
}

/** Cuenta cuántos eventos hay por valor (facetas). */
function contarOpciones(
  lista: Evento[],
  valores: (evento: Evento) => string[]
): OpcionFiltro[] {
  const conteo = new Map<string, number>();
  for (const evento of lista) {
    for (const valor of valores(evento)) {
      const clave = (valor || '').trim() || 'Sin dato';
      conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
    }
  }
  return ordenarOpciones(
    [...conteo.entries()].map(([valor, total]) => ({ valor, total }))
  );
}

/** Más eventos primero; a igual cantidad, orden alfabético. */
function ordenarOpciones(opciones: OpcionFiltro[]): OpcionFiltro[] {
  return opciones.sort(
    (a, b) => b.total - a.total || a.valor.localeCompare(b.valor, 'es')
  );
}

/** Distancia aproximada (km) al punto de referencia para orden por cercanía */
function distanciaKm(evento: Evento): number {
  const c = evento.coordenadas ?? PUNTO_REFERENCIA;
  const R = 6371;
  const dLat = toRad(c.lat - PUNTO_REFERENCIA.lat);
  const dLng = toRad(c.lng - PUNTO_REFERENCIA.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(PUNTO_REFERENCIA.lat)) *
      Math.cos(toRad(c.lat)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function toRad(grados: number): number {
  return (grados * Math.PI) / 180;
}
