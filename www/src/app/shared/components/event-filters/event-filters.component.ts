import { Component, computed, inject, Input, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import {
  EventosService,
  FiltrosEventos,
  OpcionFiltro
} from '../../../core/services/eventos.service';

/**
 * Filtros del catálogo (sidebar web).
 *
 * Todas las opciones salen del catálogo real cargado desde la API: las
 * regiones, comunas y categorías son las que existen en los datos, con el
 * número de eventos de cada una (facetas). Los grupos largos tienen su
 * propio scroll —y buscador— para no obligar a recorrer la página.
 */
@Component({
  selector: 'app-event-filters',
  standalone: true,
  imports: [IonIcon],
  templateUrl: './event-filters.component.html',
  styleUrl: './event-filters.component.scss'
})
export class EventFiltersComponent {
  private readonly eventosService = inject(EventosService);

  /** Compatibilidad con usos previos; la sidebar siempre está expandida */
  @Input() variant: 'sidebar' | 'collapsible' = 'sidebar';

  readonly filtros = this.eventosService.filtros;

  /** Opciones disponibles con el conteo de eventos de cada una. */
  readonly facetas = this.eventosService.facetas;

  readonly categorias = computed(() => this.facetas().categorias);
  readonly regiones = computed(() => this.facetas().regiones);
  readonly comunas = computed(() => this.facetas().comunas);
  readonly modalidades = computed(() => this.facetas().modalidades);
  readonly publicos = computed(() => this.facetas().publicos);

  /** Cuántos eventos coinciden con los filtros activos. */
  readonly coincidencias = computed(
    () => this.eventosService.eventosFiltrados().length
  );

  /** Buscadores internos (el catálogo real trae decenas de opciones). */
  readonly busquedaCategoria = signal('');
  readonly busquedaComuna = signal('');

  /** Panel de filtros expandido/contraído. Independentemente del variant:
   * 'collapsible' arranca contraído, 'sidebar' expandido. */
  readonly expandido = signal(this.variant !== 'collapsible');

  alternarExpandido(): void {
    this.expandido.update((v) => !v);
  }

  readonly categoriasVisibles = computed(() =>
    filtrarPor(this.categorias(), this.busquedaCategoria())
  );
  readonly comunasVisibles = computed(() =>
    filtrarPor(this.comunas(), this.busquedaComuna())
  );

  toggleCategoria(cat: string): void {
    this.eventosService.actualizarFiltros({
      categorias: this.filtros().categorias.includes(cat)
        ? this.filtros().categorias.filter((c) => c !== cat)
        : [...this.filtros().categorias, cat]
    });
  }

  onBusquedaCategoria(valor: string): void {
    this.busquedaCategoria.set(valor);
  }

  onBusquedaComuna(valor: string): void {
    this.busquedaComuna.set(valor);
  }

  setRegion(region: string | null): void {
    const comuna = this.filtros().comuna;
    const pertenece =
      !comuna ||
      !region ||
      this.eventosService.comunasDe(region).some((c) => c.valor === comuna);
    this.eventosService.actualizarFiltros({
      region,
      comuna: pertenece ? comuna : null
    });
  }

  onComuna(comuna: string | null): void {
    this.eventosService.actualizarFiltros({ comuna });
  }

  setFecha(campo: 'fechaDesde' | 'fechaHasta', valor: string): void {
    this.eventosService.actualizarFiltros({
      [campo]: valor || null
    } as Partial<FiltrosEventos>);
  }

  setModalidad(modalidad: string | null): void {
    this.eventosService.actualizarFiltros({ modalidad });
  }

  setPublico(publico: string | null): void {
    this.eventosService.actualizarFiltros({ publico });
  }

  toggleAccesible(): void {
    this.eventosService.actualizarFiltros({
      accesible: !this.filtros().accesible
    });
  }

  setGratuito(valor: boolean | null): void {
    this.eventosService.actualizarFiltros({ gratuito: valor });
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

  limpiar(): void {
    this.busquedaCategoria.set('');
    this.busquedaComuna.set('');
    this.eventosService.limpiarFiltros();
  }
}

/** Filtra opciones por texto (sin acentos ni mayúsculas). */
function filtrarPor(opciones: OpcionFiltro[], texto: string): OpcionFiltro[] {
  const busqueda = normalizar(texto);
  if (!busqueda) return opciones;
  return opciones.filter((o) => normalizar(o.valor).includes(busqueda));
}

function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
