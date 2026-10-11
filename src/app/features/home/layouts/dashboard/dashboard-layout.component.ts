import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonIcon, IonButton, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonChip, IonLabel } from '@ionic/angular';
import { EventosService } from '../../../../core/services/eventos.service';
import { ViewPreferencesService, OrdenType } from '../../../../core/services/view-preferences.service';
import { EventListComponent } from '../../../../shared/components/event-list/event-list.component';
import { EventFiltersComponent } from '../../../../shared/components/event-filters/event-filters.component';
import { ApiService } from '../../../../core/services/api.service';

/**
 * DASHBOARD LAYOUT
 * Panel denso con stats, 3 columnas (filtros/centro/widgets)
 */
@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    IonIcon,
    IonButton,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonChip,
    IonLabel,
    EventListComponent,
    EventFiltersComponent
  ],
  templateUrl: './dashboard-layout.component.html',
  styleUrl: './dashboard-layout.component.scss'
})
export class DashboardLayoutComponent {
  private readonly eventosService = inject(EventosService);
  private readonly prefs = inject(ViewPreferencesService);
  readonly api = inject(ApiService);

  readonly ordenPor = this.prefs.ordenPor;

  readonly stats = computed(() => {
    const eventos = this.eventosService.eventosFiltrados();
    return {
      total: eventos.length,
      gratuitos: eventos.filter(e => e.gratuito).length,
      categorias: new Set(eventos.map(e => e.categoria)).size,
      comunas: new Set(eventos.map(e => e.comuna)).size
    };
  });

  readonly eventosPorCategoria = computed(() => {
    const grupos: Record<string, number> = {};
    this.eventosService.eventosFiltrados().forEach(e => {
      grupos[e.categoria] = (grupos[e.categoria] || 0) + 1;
    });
    return Object.entries(grupos)
      .map(([categoria, count]) => ({ categoria, count }))
      .sort((a, b) => b.count - a.count);
  });

  readonly proximosEventos = computed(() => {
    return [...this.eventosService.eventosFiltrados()]
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .slice(0, 5);
  });

  readonly ordenes: { value: OrdenType; label: string }[] = [
    { value: 'fecha', label: 'Fecha' },
    { value: 'nombre', label: 'Nombre' },
    { value: 'categoria', label: 'Categoría' }
  ];

  onOrdenChange(orden: OrdenType): void {
    this.prefs.setOrden(orden);
  }
}

