import {
  AfterViewInit,
  Component,
  computed,
  ElementRef,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  signal,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { Evento } from '../../../core/models/evento.model';
import { EventosService } from '../../../core/services/eventos.service';
import { RecomendacionService } from '../../../core/services/recomendacion.service';
import { EventoCardComponent } from '../evento-card/evento-card.component';
import { EventoCardSkeletonComponent } from '../evento-card-skeleton/evento-card-skeleton.component';

export interface FiltroActivo {
  clave: string;
  etiqueta: string;
}

function fechaCorta(iso: string): string {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('es-CL', {
      day: 'numeric',
      month: 'short'
    });
  } catch {
    return iso;
  }
}

/** Estado de avance en la lista (se reinicia cuando cambian los resultados). */
interface AvanceLista {
  /** Firma de los resultados con los que se calculó el avance. */
  firma: object;
  pagina: number;
  bloques: number;
}

/**
 * Lista de eventos compartida entre las vistas mobile y web.
 *
 * El catálogo real trae más de mil eventos, así que la lista nunca los
 * pinta todos de una vez:
 * - Vista web (grilla): paginación clásica con selector de página.
 * - Vista móvil (lista): scroll infinito, con botón "Cargar más" de
 *   respaldo (y sin depender de eventos de scroll de un contenedor).
 *
 * Ambos modos se reinician solos al cambiar los filtros: la firma de los
 * resultados invalida el avance anterior.
 */
@Component({
  selector: 'app-event-list',
  standalone: true,
  imports: [
    CommonModule,
    IonIcon,
    EventoCardComponent,
    EventoCardSkeletonComponent
  ],
  templateUrl: './event-list.component.html',
  styleUrl: './event-list.component.scss'
})
export class EventListComponent implements OnChanges, AfterViewInit, OnDestroy {
  private readonly eventosService = inject(EventosService);
  private readonly recomendacion = inject(RecomendacionService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);

  /** 'grid' para web, 'lista' para mobile */
  @Input() layout: 'grid' | 'lista' = 'grid';

  /** Cantidad de skeletons a mostrar mientras carga */
  @Input() skeletonCount = 6;

  /** Mostrar/ocultar el botón "Limpiar filtros" en el empty state */
  @Input() showClearInEmpty = true;

  /**
   * Cómo se recorre el catálogo. En 'auto' la grilla (web) pagina y la
   * lista (móvil) usa scroll infinito.
   */
  @Input() modo: 'auto' | 'paginas' | 'infinite' = 'auto';

  /** Resultados por página; 0 usa el valor sugerido según la vista. */
  @Input() porPagina = 0;

  readonly cargando = this.eventosService.cargando;
  readonly error = this.eventosService.error;
  readonly filtros = this.eventosService.filtros;

  readonly eventos = computed(() =>
    this.eventosService
      .eventosFiltrados()
      .filter((e) => !this.recomendacion.estaOculto(e.id))
  );

  readonly skeletons = Array.from({ length: 12 });

  // ------------------------------------------------------------------
  // Avance por el catálogo (página / bloques) — web y móvil
  // ------------------------------------------------------------------

  private readonly layoutActual = signal<'grid' | 'lista'>('grid');
  private readonly avance = signal<AvanceLista | null>(null);

  /**
   * Firma de los resultados: si cambian los filtros, la carga de datos o
   * la vista, el avance guardado deja de ser válido y la lista vuelve al
   * principio (página 1 / primer bloque).
   */
  private readonly firma = computed(() => ({
    filtros: this.filtros(),
    eventos: this.eventos(),
    layout: this.layoutActual()
  }));

  private readonly vista = computed(() => {
    const firma = this.firma();
    const estado = this.avance();
    return estado && estado.firma === firma
      ? { pagina: estado.pagina, bloques: estado.bloques }
      : { pagina: 1, bloques: 1 };
  });

  /** Resultados por página (grilla) o por bloque (scroll infinito). */
  readonly tamanoBloque = computed(() =>
    this.porPagina > 0
      ? this.porPagina
      : this.layoutActual() === 'grid'
        ? 30
        : 30
  );

  readonly modoVista = computed<'paginas' | 'infinite'>(() => {
    if (this.modo !== 'auto') return this.modo;
    return this.layoutActual() === 'grid' ? 'paginas' : 'infinite';
  });

  readonly totalPaginas = computed(() =>
    Math.max(1, Math.ceil(this.eventos().length / this.tamanoBloque()))
  );

  readonly paginaActual = computed(() =>
    Math.min(this.vista().pagina, this.totalPaginas())
  );

  /** Eventos que realmente se pintan ahora. */
  readonly visibles = computed<Evento[]>(() => {
    const lista = this.eventos();
    const tamano = this.tamanoBloque();
    if (this.modoVista() === 'paginas') {
      const pagina = this.paginaActual();
      return lista.slice((pagina - 1) * tamano, pagina * tamano);
    }
    return lista.slice(0, Math.max(tamano, this.vista().bloques * tamano));
  });

  readonly hayMas = computed(
    () => this.visibles().length < this.eventos().length
  );

  /** "Mostrando 13–24 de 1203 eventos" */
  readonly rango = computed<{ desde: number; hasta: number; total: number } | null>(
    () => {
      const total = this.eventos().length;
      const mostrados = this.visibles().length;
      if (!total || !mostrados) return null;
      const desde =
        this.modoVista() === 'paginas'
          ? (this.paginaActual() - 1) * this.tamanoBloque() + 1
          : 1;
      return { desde, hasta: desde + mostrados - 1, total };
    }
  );

  /** Ventana de números de página alrededor de la actual. */
  readonly paginas = computed(() => {
    const total = this.totalPaginas();
    const actual = this.paginaActual();
    const inicio = Math.max(1, Math.min(actual - 2, total - 4));
    const fin = Math.min(total, inicio + 4);
    const lista: number[] = [];
    for (let p = inicio; p <= fin; p++) lista.push(p);
    return lista;
  });

  @ViewChild('centinela') private centinela?: ElementRef<HTMLElement>;
  private observador?: IntersectionObserver;

  ngOnChanges(): void {
    this.layoutActual.set(this.layout);
  }

  ngAfterViewInit(): void {
    const nodo = this.centinela?.nativeElement;
    if (!nodo || typeof IntersectionObserver === 'undefined') return;
    this.observador = new IntersectionObserver(
      (entradas) => this.onCruceSentinel(entradas),
      { rootMargin: '320px 0px' }
    );
    this.observador.observe(nodo);
  }

  ngOnDestroy(): void {
    this.observador?.disconnect();
  }

  /** Nuevos eventos a medida que el final de la lista se acerca. */
  private onCruceSentinel(entradas: IntersectionObserverEntry[]): void {
    if (!entradas.some((e) => e.isIntersecting)) return;
    if (this.modoVista() !== 'infinite' || !this.hayMas()) return;
    this.cargarMas();
    // Tras pintar los nuevos resultados, si el centinela sigue en pantalla
    // se vuelve a observar para traer el bloque siguiente.
    window.setTimeout(() => this.reobservar(), 250);
  }

  private reobservar(): void {
    const nodo = this.centinela?.nativeElement;
    if (!nodo || !this.observador) return;
    this.observador.unobserve(nodo);
    this.observador.observe(nodo);
  }

  // ------------------------------------------------------------------
  // Navegación de resultados
  // ------------------------------------------------------------------

  irA(pagina: number): void {
    const destino = Math.min(Math.max(1, pagina), this.totalPaginas());
    this.avanzar(destino, 1, true);
  }

  anterior(): void {
    this.irA(this.paginaActual() - 1);
  }

  siguiente(): void {
    this.irA(this.paginaActual() + 1);
  }

  /** Trae el bloque siguiente (scroll infinito y respaldo con botón). */
  cargarMas(): void {
    if (!this.hayMas()) return;
    this.avanzar(this.paginaActual(), this.vista().bloques + 1);
  }

  private avanzar(pagina: number, bloques: number, subir = false): void {
    this.avance.set({ firma: this.firma(), pagina, bloques });
    if (subir) this.volverAlInicio();
  }

  /** Al cambiar de página, la vista vuelve al inicio de los resultados. */
  private volverAlInicio(): void {
    const destino = (
      this.host.nativeElement as HTMLElement
    ).querySelector<HTMLElement>('.ec-list-header');
    destino?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  // ------------------------------------------------------------------
  // Filtros activos y estados
  // ------------------------------------------------------------------

  /** Chips de filtros combinados, visibles y eliminables uno a uno */
  readonly filtrosActivos = computed<FiltroActivo[]>(() => {
    const f = this.filtros();
    const chips: FiltroActivo[] = [];
    if (f.texto.trim()) {
      chips.push({ clave: 'texto', etiqueta: `Búsqueda: «${f.texto.trim()}»` });
    }
    for (const cat of f.categorias) {
      chips.push({ clave: `cat:${cat}`, etiqueta: cat });
    }
    if (f.region) chips.push({ clave: 'region', etiqueta: f.region });
    if (f.comuna) chips.push({ clave: 'comuna', etiqueta: f.comuna });
    if (f.fechaDesde) {
      chips.push({ clave: 'fechaDesde', etiqueta: `Desde ${fechaCorta(f.fechaDesde)}` });
    }
    if (f.fechaHasta) {
      chips.push({ clave: 'fechaHasta', etiqueta: `Hasta ${fechaCorta(f.fechaHasta)}` });
    }
    if (f.gratuito === true) chips.push({ clave: 'gratuito', etiqueta: 'Solo gratuitos' });
    if (f.gratuito === false) chips.push({ clave: 'gratuito', etiqueta: 'Con costo' });
    if (f.modalidad) chips.push({ clave: 'modalidad', etiqueta: f.modalidad });
    if (f.publico) chips.push({ clave: 'publico', etiqueta: `Público: ${f.publico}` });
    if (f.accesible) {
      chips.push({ clave: 'accesible', etiqueta: 'Con accesibilidad informada' });
    }
    return chips;
  });

  quitar(clave: string): void {
    this.eventosService.quitarFiltro(clave);
  }

  tieneFiltrosActivos(): boolean {
    const f = this.filtros();
    return (
      !!f.texto ||
      f.categorias.length > 0 ||
      !!f.region ||
      !!f.comuna ||
      !!f.fechaDesde ||
      !!f.fechaHasta ||
      f.gratuito !== null ||
      !!f.modalidad ||
      !!f.publico ||
      f.accesible
    );
  }

  limpiarFiltros(): void {
    this.eventosService.limpiarFiltros();
  }

  /** Reintenta la carga (estado de error). */
  onReintentar(): void {
    this.eventosService.setError(null);
    this.eventosService.cargarEventos();
  }

  // ------------------------------------------------------------------
  // Señales de interés (reemplazan favoritos)
  // ------------------------------------------------------------------

  onMeInteresa(cambio: { eventoId: string; activo: boolean }): void {
    this.recomendacion.alternarMeInteresa(cambio.eventoId, cambio.activo);
  }

  /**
   * "No me interesa": la tarjeta ya se desvaneció (salidaTerminada).
   * Se registra la señal negativa —retira el evento del listado vía
   * ocultos— y se limpia el marcador de retiro.
   */
  onSalidaTerminada(eventoId: string): void {
    this.recomendacion.registrarSenal('no_me_interesa', eventoId);
  }

  /** "Ver similares": Descubrir filtrado por la categoría del evento. */
  onVerSimilares(eventoId: string): void {
    const evento = this.eventosService
      .obtenerVigentes()
      .find((e) => e.id === eventoId);
    if (!evento) return;

    this.recomendacion.registrarSenal('ver_similares', eventoId);
    this.eventosService.actualizarFiltros({ categorias: evento.categorias });
    this.eventosService.limpiarOtrosFiltros('categorias');
    this.router.navigate(['/home']);
  }
}
