import { Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { IonSearchbar, IonIcon } from '@ionic/angular';
import { EventosService } from '../../../core/services/eventos.service';
import { ViewPreferencesService } from '../../../core/services/view-preferences.service';
import { EventListComponent } from '../../../shared/components/event-list/event-list.component';
import { EventFiltersComponent } from '../../../shared/components/event-filters/event-filters.component';
import { EventToolbarComponent } from '../../../shared/components/event-toolbar/event-toolbar.component';
import { CATEGORIAS, DATA_ACTUALIZACION } from '../../../data/mock-eventos';

/**
 * Página Descubrir (shell web).
 * Hero editorial + búsqueda + chips por categoría + sidebar de filtros
 * + toolbar de orden/vista + grilla de resultados (event-list compartida).
 */
@Component({
  selector: 'app-discover-layout',
  standalone: true,
  imports: [DatePipe, IonSearchbar, IonIcon, EventListComponent, EventFiltersComponent, EventToolbarComponent],
  templateUrl: './discover-layout.component.html',
  styleUrl: './discover-layout.component.scss'
})
export class DiscoverLayoutComponent {
  private readonly eventosService = inject(EventosService);
  readonly prefs = inject(ViewPreferencesService);

  readonly categorias = CATEGORIAS;
  readonly dataActualizacion = DATA_ACTUALIZACION;

  readonly filtros = this.eventosService.filtros;
  readonly vista = this.prefs.vista;
  readonly ordenPor = this.prefs.ordenPor;

  /** DEF-QA-010: el KPI usaba el catálogo crudo (incluye vencidos) mientras
   *  la lista cuenta vigentes. Todo el hero usa vigentes para coincidir. */
  readonly totalEventos = computed(() => this.eventosService.eventosVigentes().length);
  readonly totalComunas = computed(
    () => new Set(this.eventosService.eventosVigentes().map((e) => e.comuna)).size
  );
  readonly totalRegiones = computed(
    () => new Set(this.eventosService.eventosVigentes().map((e) => e.region)).size
  );
  readonly totalGratuitos = computed(
    () => this.eventosService.eventosVigentes().filter((e) => e.gratuito).length
  );

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

  onBusqueda(valor: string | null | undefined): void {
    this.eventosService.actualizarFiltros({ texto: valor ?? '' });
  }

  /** Categorías múltiples: clic alterna la selección */
  /** Categorías múltiples: clic alterna la selección */
  toggleCategoria(cat: string): void {
    const actuales = this.filtros().categorias;
    this.eventosService.actualizarFiltros({
      categorias: actuales.includes(cat)
        ? actuales.filter((c) => c !== cat)
        : [...actuales, cat]
    });
  }

  limpiarCategorias(): void {
    this.eventosService.actualizarFiltros({ categorias: [] });
  }

  setVista(v: 'grid' | 'lista'): void {
    this.prefs.setVista(v);
  }

  setOrden(o: 'fecha' | 'nombre' | 'categoria' | 'cercania' | 'actualizacion'): void {
    this.prefs.setOrden(o);
    this.eventosService.setOrden(o);
  }
}

