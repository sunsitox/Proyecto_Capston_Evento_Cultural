import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { IonIcon } from '@ionic/angular';
import { EventosService } from '../../core/services/eventos.service';
import { RecomendacionService } from '../../core/services/recomendacion.service';
import { EventoCardComponent } from '../../shared/components/evento-card/evento-card.component';
import { EventoCardSkeletonComponent } from '../../shared/components/evento-card-skeleton/evento-card-skeleton.component';
import { Evento } from '../../core/models/evento.model';

interface DiaCalendario {
  iso: string;
  numero: number;
  enMes: boolean;
  pasado: boolean;
  cantidad: number;
}

const SEMANAS = ['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do'];
const MESES_ADELANTE = 3;

/** ¿El periodo del evento toca el rango [desde, hasta]? (comparación ISO). */
function eventoTocaRango(e: Evento, desdeISO: string, hastaISO: string): boolean {
  const termina = e.fechaTermino ?? e.fecha;
  return !(termina < desdeISO || e.fecha > hastaISO);
}

/**
 * Calendario de eventos vigentes.
 * Selector mensual (hasta 3 meses adelante), días marcados con cantidad
 * de eventos y listado del día seleccionado con filtros por región,
 * comuna y categoría. Los días pasados se desactivan: los eventos
 * rotan y vencen, nunca se muestran fechas pasadas.
 */
@Component({
  selector: 'app-calendario',
  standalone: true,
  imports: [FormsModule, IonIcon, EventoCardComponent, EventoCardSkeletonComponent],
  templateUrl: './calendario.page.html',
  styleUrl: './calendario.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CalendarioPage {
  private readonly eventosService = inject(EventosService);
  private readonly recomendacion = inject(RecomendacionService);
  private readonly router = inject(Router);

  readonly semanas = SEMANAS;

  /**
   * Opciones de filtro tomadas del catálogo real (mismas facetas que
   * Descubrir/Mapa). Las comunas dependen de la región elegida: al
   * cambiar región, la lista de comunas se restringe a esa región.
   */
  private readonly facetas = this.eventosService.facetas;

  readonly categorias = computed(() => this.facetas().categorias.map((o) => o.valor));
  readonly regiones = computed(() => this.facetas().regiones.map((o) => o.valor));
  readonly comunas = computed<string[]>(() =>
    (this.filtroRegion()
      ? this.eventosService.comunasDe(this.filtroRegion())
      : this.facetas().comunas
    ).map((o) => o.valor)
  );

  readonly cargando = this.eventosService.cargando;
  readonly error = this.eventosService.error;

  /** Primer día del mes visible (local). */
  private readonly mes = signal(this.inicioMes(new Date()));
  readonly fechaSeleccionada = signal<string>(EventosService.hoyISO());

  /**
   * Rango de fechas seleccionado (dos clics):
   * - null: sin rango (listado de un solo día).
   * - {desde} sin hasta: esperando el segundo clic.
   * - {desde, hasta}: rango armado; el listado muestra los eventos
   *   vigentes en ese rango (no min/max: cualquier evento cuyo periodo
   *   [fecha, fechaTermino] toque el rango entra).
   */
  readonly rango = signal<{ desde: string; hasta?: string } | null>(null);

  /** Dirección del último cambio de mes (para la transición horizontal). */
  private readonly direccionMes = signal<0 | 1 | -1>(0);

  private readonly gridRef = viewChild<ElementRef<HTMLElement>>('gridRef');

  // Filtros locales del listado diario
  readonly filtroRegion = signal('');
  readonly filtroComuna = signal('');
  readonly filtroCategoria = signal('');

  readonly mesTitulo = computed(() => {
    const d = this.mes();
    const texto = new Intl.DateTimeFormat('es-CL', {
      month: 'long',
      year: 'numeric'
    }).format(d);
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  });

  /** Título del día seleccionado con mayúscula inicial. */
  readonly tituloDia = computed(() => {
    const texto = new Intl.DateTimeFormat('es-CL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    }).format(new Date(`${this.fechaSeleccionada()}T12:00:00`));
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  });

  /** Etiqueta del encabezado del listado: día único o rango. */
  readonly tituloListado = computed(() => {
    const r = this.rango();
    if (!r?.hasta) return this.tituloDia();
    if (r.hasta === r.desde) return this.tituloDia();
    const fmt = new Intl.DateTimeFormat('es-CL', {
      day: 'numeric',
      month: 'long'
    });
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    return `${cap(fmt.format(new Date(`${r.desde}T12:00:00`)))} — ${cap(
      fmt.format(new Date(`${r.hasta}T12:00:00`))
    )}`;
  });

  /** Cantidad de eventos por fecha ISO (expande rangos multi-día). */
  private readonly conteoPorFecha = computed(() => {
    const mapa = new Map<string, number>();
    for (const e of this.eventosService.obtenerVigentes()) {
      // Los permanentes no marcan días: su vigencia es indefinida.
      if (e.permanente) continue;
      const inicio = new Date(`${e.fecha}T00:00:00`);
      const fin = new Date(`${e.fechaTermino ?? e.fecha}T00:00:00`);
      for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
        const iso = this.aISO(d);
        mapa.set(iso, (mapa.get(iso) ?? 0) + 1);
      }
    }
    return mapa;
  });

  /** Celdas del mes visible (6 semanas fijas, lunes primero). */
  readonly dias = computed<DiaCalendario[]>(() => {
    const primerDia = this.mes();
    const hoy = EventosService.hoyISO();
    const offset = (primerDia.getDay() + 6) % 7;
    const celdas: DiaCalendario[] = [];
    const inicio = new Date(primerDia);
    inicio.setDate(inicio.getDate() - offset);

    for (let i = 0; i < 42; i++) {
      const d = new Date(inicio);
      d.setDate(d.getDate() + i);
      const iso = this.aISO(d);
      celdas.push({
        iso,
        numero: d.getDate(),
        enMes: d.getMonth() === primerDia.getMonth(),
        pasado: iso < hoy,
        cantidad: this.conteoPorFecha().get(iso) ?? 0
      });
    }
    return celdas;
  });

  /** Eventos del día (o del rango) seleccionado con los filtros locales aplicados. */
  readonly eventosDelDia = computed<Evento[]>(() => {
    const r = this.rango();
    const hasta = r?.hasta;
    const lista = r && hasta
      ? this.eventosService.obtenerVigentes().filter((e) => eventoTocaRango(e, r.desde, hasta))
      : this.eventosService.obtenerPorFecha(this.fechaSeleccionada());
    const region = this.filtroRegion();
    const comuna = this.filtroComuna();
    const categoria = this.filtroCategoria();
    return lista.filter(
      (e) =>
        (!region || e.region === region) &&
        (!comuna || e.comuna === comuna) &&
        (!categoria || e.categorias.includes(categoria as never)) &&
        !this.recomendacion.estaOculto(e.id)
    );
  });

  readonly filtrosActivos = computed(
    () => !!this.filtroRegion() || !!this.filtroComuna() || !!this.filtroCategoria()
  );

  /** DEF-QA-005: la agenda diaria pintaba 500+ tarjetas de una vez.
   *  Se pagina por bloques de 24 como en el mapa. */
  private readonly tamanoDia = 24;
  private readonly paginaDia = signal(1);

  readonly eventosDelDiaVisibles = computed(() =>
    this.eventosDelDia().slice(0, this.paginaDia() * this.tamanoDia)
  );

  readonly hayMasDia = computed(
    () => this.eventosDelDiaVisibles().length < this.eventosDelDia().length
  );

  verMasDia(): void {
    this.paginaDia.update((p) => p + 1);
  }

  private reiniciarPaginaDia(): void {
    this.paginaDia.set(1);
  }

  /** Reintenta la carga (estado de error). */
  onReintentar(): void {
    this.eventosService.setError(null);
    this.eventosService.cargarEventos();
  }

  puedeRetroceder(): boolean {
    const actual = this.inicioMes(new Date());
    return this.mes().getTime() > actual.getTime();
  }

  puedeAvanzar(): boolean {
    const limite = this.inicioMes(new Date());
    limite.setMonth(limite.getMonth() + MESES_ADELANTE);
    return this.mes().getTime() < limite.getTime();
  }

  cambiarMes(delta: number): void {
    if ((delta < 0 && !this.puedeRetroceder()) || (delta > 0 && !this.puedeAvanzar())) {
      return;
    }
    this.direccionMes.set(delta as 1 | -1);
    this.mes.update((m) => {
      const siguiente = new Date(m);
      siguiente.setMonth(siguiente.getMonth() + delta);
      return this.inicioMes(siguiente);
    });
    this.animarCambioMes(delta);
  }

  /**
   * Deslizamiento horizontal breve (180 ms) según la dirección del
   * cambio de mes. Se anula si el sistema pide reducir movimiento.
   */
  private animarCambioMes(delta: number): void {
    if (
      typeof matchMedia !== 'undefined' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    const el = this.gridRef()?.nativeElement;
    if (!el?.animate) return;
    el.animate(
      [
        { transform: `translateX(${delta > 0 ? 24 : -24}px)`, opacity: 0.4 },
        { transform: 'translateX(0)', opacity: 1 }
      ],
      { duration: 180, easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)' }
    );
  }

  /**
   * Selecciona un día. Los días de meses externos con eventos también
   * son seleccionables: el calendario salta al mes correspondiente.
   *
   * Con rango: 1er clic marca el inicio; 2º clic arma el rango (si el
   * segundo día es anterior, se invierte); 3er clic inicia un rango
   * nuevo desde esa fecha.
   */
  seleccionarDia(dia: DiaCalendario): void {
    if (dia.pasado) return;
    if (!dia.enMes) {
      const objetivo = new Date(`${dia.iso}T00:00:00`);
      this.direccionMes.set(objetivo.getTime() >= this.mes().getTime() ? 1 : -1);
      this.mes.set(new Date(objetivo.getFullYear(), objetivo.getMonth(), 1));
      this.animarCambioMes(this.direccionMes());
    }

    const r = this.rango();
    this.reiniciarPaginaDia();
    if (!r || r.hasta) {
      // Rango nuevo desde este día (pendiente del segundo clic).
      this.rango.set({ desde: dia.iso });
      this.fechaSeleccionada.set(dia.iso);
    } else if (dia.iso === r.desde) {
      // Segundo clic sobre el mismo día: rango de un solo día.
      this.rango.set({ desde: dia.iso, hasta: dia.iso });
    } else if (dia.iso < r.desde) {
      // Ordena el rango de forma natural (a → b).
      this.rango.set({ desde: dia.iso, hasta: r.desde });
    } else {
      this.rango.set({ desde: r.desde, hasta: dia.iso });
    }
  }

  /** Limpia el rango y vuelve al listado diario de hoy. */
  limpiarRango(): void {
    this.rango.set(null);
    this.fechaSeleccionada.set(EventosService.hoyISO());
    this.reiniciarPaginaDia();
  }

  /** ¿El día está dentro del rango armado (inclusive)? */
  enRango(dia: DiaCalendario): boolean {
    const r = this.rango();
    if (!r?.hasta) return false;
    return dia.iso >= r.desde && dia.iso <= r.hasta;
  }

  /** ¿El día es el inicio o el fin del rango (para resaltar bordes)? */
  bordeRango(dia: DiaCalendario): boolean {
    const r = this.rango();
    if (!r) return false;
    return dia.iso === r.desde || (!r.hasta ? false : dia.iso === r.hasta);
  }

  irAHoy(): void {
    this.mes.set(this.inicioMes(new Date()));
    this.fechaSeleccionada.set(EventosService.hoyISO());
    this.reiniciarPaginaDia();
  }

  limpiarFiltros(): void {
    this.filtroRegion.set('');
    this.filtroComuna.set('');
    this.filtroCategoria.set('');
    this.reiniciarPaginaDia();
  }

  /** Cambiar de región reinicia la comuna cuando no pertenece a ella. */
  onRegion(region: string): void {
    this.filtroRegion.set(region);
    this.reiniciarPaginaDia();
    const comuna = this.filtroComuna();
    const pertenece =
      !comuna ||
      !region ||
      this.eventosService.comunasDe(region).some((c) => c.valor === comuna);
    if (!pertenece) this.filtroComuna.set('');
  }

  onMeInteresa(cambio: { eventoId: string; activo: boolean }): void {
    this.recomendacion.alternarMeInteresa(cambio.eventoId, cambio.activo);
  }

  onNoMeInteresa(eventoId: string): void {
    this.recomendacion.registrarSenal('no_me_interesa', eventoId);
  }

  onVerSimilares(eventoId: string): void {
    const evento = this.eventosService.obtenerVigentes().find((e) => e.id === eventoId);
    if (!evento) return;
    this.recomendacion.registrarSenal('ver_similares', eventoId);
    this.eventosService.actualizarFiltros({ categorias: evento.categorias });
    this.eventosService.limpiarOtrosFiltros('categorias');
    this.router.navigate(['/home']);
  }

  private inicioMes(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  private aISO(d: Date): string {
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const dia = `${d.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${dia}`;
  }
}
