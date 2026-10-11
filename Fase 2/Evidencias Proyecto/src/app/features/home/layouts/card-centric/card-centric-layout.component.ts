import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonIcon, IonCard, IonCardContent, IonChip, IonLabel, IonButton } from '@ionic/angular';
import { EventosService } from '../../../../core/services/eventos.service';
import { ViewPreferencesService, OrdenType } from '../../../../core/services/view-preferences.service';
import { EventListComponent } from '../../../../shared/components/event-list/event-list.component';
import { CategoriaEvento } from '../../../../core/models/evento.model';

interface CategoriaUI {
  readonly nombre: string;
  readonly icono: string;
  readonly valor: CategoriaEvento | '';
}

/**
 * CARD-CENTRIC LAYOUT
 * Todo organizado en cards, header con gradiente, categorías como cards
 */
@Component({
  selector: 'app-card-centric-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    IonIcon,
    IonCard,
    IonCardContent,
    IonChip,
    IonLabel,
    IonButton,
    EventListComponent
  ],
  templateUrl: './card-centric-layout.component.html',
  styleUrl: './card-centric-layout.component.scss'
})
export class CardCentricLayoutComponent {
  private readonly eventosService = inject(EventosService);
  private readonly prefs = inject(ViewPreferencesService);

  readonly ordenPor = this.prefs.ordenPor;
  readonly filtros = this.eventosService.filtros;

  readonly categorias: readonly CategoriaUI[] = [
    { nombre: 'Todas', icono: 'apps-outline', valor: '' },
    { nombre: 'Música', icono: 'musical-notes-outline', valor: 'Música' },
    { nombre: 'Arte y Cultura', icono: 'color-palette-outline', valor: 'Arte y Cultura' },
    { nombre: 'Gastronomía', icono: 'restaurant-outline', valor: 'Gastronomía' },
    { nombre: 'Ferias y Mercados', icono: 'storefront-outline', valor: 'Ferias y Mercados' },
    { nombre: 'Municipal', icono: 'business-outline', valor: 'Municipal' },
    { nombre: 'Familiar', icono: 'people-outline', valor: 'Familiar' },
    { nombre: 'Deportivo', icono: 'football-outline', valor: 'Deportivo' }
  ];

  readonly ordenes: { value: OrdenType; label: string }[] = [
    { value: 'fecha', label: 'Fecha' },
    { value: 'nombre', label: 'Nombre' },
    { value: 'categoria', label: 'Categoría' }
  ];

  seleccionarCategoria(cat: CategoriaEvento | ''): void {
    this.eventosService.actualizarFiltros({ categorias: cat ? [cat] : [] });
  }

  onOrdenChange(orden: OrdenType): void {
    this.prefs.setOrden(orden);
  }

  onBusqueda(valor: string): void {
    this.eventosService.actualizarFiltros({ texto: valor });
  }

  getCategoriaActual(): string {
    const categorias = this.filtros().categorias;
    return categorias.length === 1 ? categorias[0] : '';
  }

  /** Título de la tarjeta de eventos según las categorías activas */
  get tituloCategoria(): string {
    const categorias = this.filtros().categorias;
    if (categorias.length === 0) return 'Todos los eventos';
    if (categorias.length === 1) return categorias[0];
    return `${categorias.length} categorías seleccionadas`;
  }
}

