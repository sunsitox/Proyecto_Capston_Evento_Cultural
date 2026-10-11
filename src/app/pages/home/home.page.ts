import { Component, ViewChild, AfterViewInit, inject, OnInit, signal, computed } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonSearchbar, IonIcon } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { EventosService } from '../../core/services/eventos.service';
import { EventListComponent } from '../../shared/components/event-list/event-list.component';
import {
  EventFiltersSheetComponent
} from '../../shared/components/event-filters-sheet/event-filters-sheet.component';
import { CATEGORIAS, DATA_ACTUALIZACION } from '../../data/mock-eventos';

/**
 * Vista móvil del Home (Descubrir / Buscar).
 * Reutiliza los componentes compartidos — misma fuente de verdad que el shell web.
 */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    IonSearchbar,
    IonIcon,
    EventListComponent,
    EventFiltersSheetComponent
  ],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss'
})
export class HomePage implements OnInit, AfterViewInit {
  @ViewChild('searchbar', { static: false }) searchbar?: IonSearchbar;

  private readonly route = inject(ActivatedRoute);

  readonly categorias = CATEGORIAS;
  readonly busquedaActual = signal('');

  readonly eventosService = inject(EventosService);

  /**
   * Cantidad de filtros avanzados activos (los que viven en el bottom
   * sheet: territorio, fechas, modalidad, público, precio y
   * accesibilidad). Se muestra como badge en el botón "Filtros".
   */
  readonly filtrosAvanzadosActivos = computed(() => {
    const f = this.eventosService.filtros();
    let n = 0;
    if (f.region) n++;
    if (f.comuna) n++;
    if (f.fechaDesde) n++;
    if (f.fechaHasta) n++;
    if (f.gratuito !== null) n++;
    if (f.modalidad) n++;
    if (f.publico) n++;
    if (f.accesible) n++;
    return n;
  });

  ngOnInit(): void {
    this.eventosService.cargarEventos();
  }

  ngAfterViewInit(): void {
    const path = this.route.snapshot.routeConfig?.path;
    if (path === 'buscar') {
      setTimeout(() => this.searchbar?.setFocus(), 200);
    }
  }

  private readonly CAT_CLASS: Record<string, string> = {
    'Música': 'musica',
    'Arte y Cultura': 'arte',
    'Gastronomía': 'gastro',
    'Ferias y Mercados': 'ferias',
    'Municipal': 'municipal',
    'Familiar': 'familiar',
    'Deportivo': 'deporte'
  };

  catClassOf(categoria: string): string {
    return 'ec-cat--' + (this.CAT_CLASS[categoria] ?? 'musica');
  }

  toggleCategoria(cat: string): void {
    const actuales = this.eventosService.filtros().categorias;
    this.eventosService.actualizarFiltros({
      categorias: actuales.includes(cat)
        ? actuales.filter((c) => c !== cat)
        : [...actuales, cat]
    });
  }

  limpiarCategorias(): void {
    this.eventosService.actualizarFiltros({ categorias: [] });
  }

  readonly dataActualizacion = DATA_ACTUALIZACION;

  onBusqueda(valor: string | null | undefined): void {
    const texto = valor ?? '';
    this.busquedaActual.set(texto);
    this.eventosService.actualizarFiltros({ texto });
  }

  shouldShowClear(): boolean {
    return this.busquedaActual().length > 0;
  }
}

