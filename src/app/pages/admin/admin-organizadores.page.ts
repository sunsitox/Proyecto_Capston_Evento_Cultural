import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminSidebarComponent } from './admin-sidebar.component';
import { AdminUiService } from './admin-ui.service';
import { EventosService } from '../../core/services/eventos.service';
import { Evento } from '../../core/models/evento.model';

/**
 * Sección "Organizadores" del panel: entidades organizadoras detectadas en el
 * catálogo, con su volumen de eventos y dónde operan. Lectura pura: aquí no
 * se editan datos (los eventos nacen de las páginas de extracción).
 */
@Component({
  selector: 'app-admin-organizadores',
  standalone: true,
  imports: [DecimalPipe, FormsModule, AdminSidebarComponent],
  templateUrl: './admin-organizadores.page.html',
  styleUrls: ['./admin-panel.shared.scss', './admin-organizadores.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminOrganizadoresPage {
  private readonly eventosService = inject(EventosService);

  /** Estado de interfaz compartido (drawer con el botón ☰). */
  readonly ui = inject(AdminUiService);

  /** Búsqueda por nombre de organizador o comuna. */
  readonly busqueda = signal('');

  /** Organizador agregado en una fila de la lista. */
  readonly organizadores = computed<FilaOrganizador[]>(() => {
    const criterio = this.busqueda().trim().toLowerCase();

    const filas = new Map<string, FilaOrganizador>();
    for (const e of this.eventosService.eventosVigentes()) {
      const clave = nombreDe(e);
      let fila = filas.get(clave);
      if (!fila) {
        fila = {
          nombre: clave,
          vigentes: 0,
          eventos: new Set(),
          comunas: new Set(),
          gratuitos: 0
        };
        filas.set(clave, fila);
      }
      fila.vigentes += 1;
      fila.eventos.add(e.titulo.toLowerCase());
      if (e.comuna) fila.comunas.add(e.comuna);
      if (e.gratuito) fila.gratuitos += 1;
    }

    return [...filas.values()]
      .filter(
        (f) =>
          !criterio ||
          f.nombre.toLowerCase().includes(criterio) ||
          [...f.comunas].some((c) => c.toLowerCase().includes(criterio))
      )
      .sort(
        (a, b) =>
          b.vigentes - a.vigentes || b.eventos.size - a.eventos.size || a.nombre.localeCompare(b.nombre)
      );
  });

  readonly totalOrganizadores = computed(() => this.organizadores().length);
  readonly totalEventosUnicos = computed(() =>
    this.organizadores().reduce((suma, f) => suma + f.eventos.size, 0)
  );

  /** Base de escala de las barras (el organizador con más vigentes). */
  readonly maximo = computed(() =>
    Math.max(1, ...this.organizadores().map((f) => f.vigentes))
  );

  /** Porcentaje relativo para la barra de la fila (0..100). */
  pct(cantidad: number, maximo: number): number {
    return maximo > 0 ? Math.round((cantidad / maximo) * 100) : 0;
  }
}

interface FilaOrganizador {
  nombre: string;
  /** Eventos vigentes visibles (catálogo tras ocultar páginas). */
  vigentes: number;
  /** Títulos únicos organizados (evita doble conteo por fechas). */
  eventos: Set<string>;
  comunas: Set<string>;
  gratuitos: number;
}

function nombreDe(e: Evento): string {
  return e.organizador && e.organizador.trim() ? e.organizador : 'Sin organizador declarado';
}
