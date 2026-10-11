import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonIcon, IonButton, IonChip, IonLabel } from '@ionic/angular';
import { EventosService } from '../../../../core/services/eventos.service';
import { ViewPreferencesService, OrdenType, VistaType } from '../../../../core/services/view-preferences.service';
import { EventListComponent } from '../../../../shared/components/event-list/event-list.component';
import { EventFiltersComponent } from '../../../../shared/components/event-filters/event-filters.component';

/**
 * EDITORIAL LAYOUT
 * Tipo revista cultural: hero grande, sidebar, grid 2 columnas
 */
@Component({
  selector: 'app-editorial-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    IonIcon,
    IonButton,
    IonChip,
    IonLabel,
    EventListComponent,
    EventFiltersComponent
  ],
  templateUrl: './editorial-layout.component.html',
  styleUrl: './editorial-layout.component.scss'
})
export class EditorialLayoutComponent {
  private readonly eventosService = inject(EventosService);
  private readonly prefs = inject(ViewPreferencesService);

  readonly ordenPor = this.prefs.ordenPor;
  readonly vista = this.prefs.vista;
  readonly eventoDestacado = computed(() => this.eventosService.eventosFiltrados()[0]);

  readonly ordenes: { value: OrdenType; label: string }[] = [
    { value: 'fecha', label: 'Fecha' },
    { value: 'nombre', label: 'Nombre' },
    { value: 'categoria', label: 'Categoría' }
  ];

  onOrdenChange(orden: OrdenType): void {
    this.prefs.setOrden(orden);
  }

  onVistaChange(vista: VistaType): void {
    this.prefs.setVista(vista);
  }
}

