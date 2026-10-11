import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal
} from '@angular/core';
import { IonIcon } from '@ionic/angular';
import {
  EventosService,
  FILTROS_INICIALES,
  FiltrosEventos
} from '../../../core/services/eventos.service';
import { BottomSheetComponent } from '../bottom-sheet/bottom-sheet.component';

/**
 * Filtros avanzados del catálogo en un bottom sheet (móvil).
 *
 * Trabaja sobre un BORRADOR local y sólo al pulsar "Aplicar" escribe en
 * el EventosService: evita recalcular la grilla en cada toque. Incluye
 * "Limpiar filtros", cierre accesible (Escape, backdrop, botón) y
 * contador de filtros activos en el botón disparador.
 *
 * Las opciones (categorías, regiones, comunas, público) salen del
 * catálogo real cargado desde la API y muestran cuántos eventos tiene
 * cada una según el borrador en curso.
 */
@Component({
  selector: 'app-event-filters-sheet',
  standalone: true,
  imports: [IonIcon, BottomSheetComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './event-filters-sheet.component.html',
  styleUrl: './event-filters-sheet.component.scss'
})
export class EventFiltersSheetComponent {
  private readonly eventosService = inject(EventosService);

  /** Controla la apertura del bottom sheet (vía el trigger). */
  readonly abierto = signal(false);

  /** Copia editable: se aplica sólo al confirmar (accesible en la plantilla). */
  readonly borrador = signal<FiltrosEventos>({ ...this.eventosService.filtros() });

  readonly filtros = this.eventosService.filtros;

  /** Opciones del catálogo real con el conteo para el borrador en curso. */
  readonly facetas = computed(() =>
    this.eventosService.facetasPara(this.borrador())
  );

  readonly categorias = computed(() => this.facetas().categorias);
  readonly regiones = computed(() => this.facetas().regiones);
  readonly modalidades = computed(() => this.facetas().modalidades);
  readonly publicos = computed(() => this.facetas().publicos);

  /** Comunas de la región elegida en el borrador (catálogo real). */
  readonly comunas = computed(() => {
    const region = this.borrador().region;
    return region ? this.eventosService.comunasDe(region) : [];
  });

  /** Eventos que quedarían al aplicar el borrador. */
  readonly coincidencias = computed(() =>
    this.eventosService.contarCoincidencias(this.borrador())
  );

  readonly cantidadActivos = computed(() =>
    this.contar(this.eventosService.filtros())
  );

  abrir(): void {
    this.borrador.set({ ...this.eventosService.filtros() });
    this.abierto.set(true);
  }

  cerrar(): void {
    this.abierto.set(false);
  }

  aplicar(): void {
    this.eventosService.reemplazarFiltros(this.borrador());
    this.cerrar();
  }

  limpiar(): void {
    this.borrador.set({ ...FILTROS_INICIALES });
  }

  // ---- Edición del borrador ---------------------------------------

  toggleCategoria(cat: string): void {
    this.borrador.update((f) => ({
      ...f,
      categorias: f.categorias.includes(cat)
        ? f.categorias.filter((c) => c !== cat)
        : [...f.categorias, cat]
    }));
  }

  setRegion(region: string): void {
    this.borrador.update((f) => ({
      ...f,
      region: region || null,
      // La comuna debe pertenecer a la región elegida.
      comuna:
        f.comuna && region && !this.comunaPertenece(f.comuna, region)
          ? null
          : f.comuna
    }));
  }

  setComuna(comuna: string): void {
    this.borrador.update((f) => ({ ...f, comuna: comuna || null }));
  }

  setFecha(campo: 'fechaDesde' | 'fechaHasta', valor: string): void {
    this.borrador.update((f) => ({ ...f, [campo]: valor || null }));
  }

  setModalidad(modalidad: string): void {
    this.borrador.update((f) => ({ ...f, modalidad: modalidad || null }));
  }

  setPublico(publico: string): void {
    this.borrador.update((f) => ({ ...f, publico: publico || null }));
  }

  setPrecio(valor: string): void {
    const gratuito = valor === 'gratis' ? true : valor === 'costo' ? false : null;
    this.borrador.update((f) => ({ ...f, gratuito }));
  }

  toggleAccesible(): void {
    this.borrador.update((f) => ({ ...f, accesible: !f.accesible }));
  }

  precioActual(): string {
    const g = this.borrador().gratuito;
    return g === true ? 'gratis' : g === false ? 'costo' : 'todos';
  }

  private comunaPertenece(comuna: string, region: string): boolean {
    return this.eventosService.comunasDe(region).some((c) => c.valor === comuna);
  }

  private contar(f: FiltrosEventos): number {
    let n = 0;
    n += f.categorias.length;
    if (f.region) n++;
    if (f.comuna) n++;
    if (f.fechaDesde) n++;
    if (f.fechaHasta) n++;
    if (f.gratuito !== null) n++;
    if (f.modalidad) n++;
    if (f.publico) n++;
    if (f.accesible) n++;
    return n;
  }
}
