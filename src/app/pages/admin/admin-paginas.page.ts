import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { AdminSidebarComponent } from './admin-sidebar.component';
import { AdminUiService } from './admin-ui.service';
import { EventosService } from '../../core/services/eventos.service';
import { Evento } from '../../core/models/evento.model';

/** Fila de la lista de páginas/fuentes de extracción. */
interface FuenteInfo {
  nombre: string;
  /** Eventos de esta página en el catálogo completo (incluye ocultos). */
  total: number;
  /** Eventos vigentes visibles de esta página. */
  vigentes: number;
  /** Estado de ocultación (switch desactivado). */
  oculta: boolean;
}

/**
 * Sección "Páginas" del panel: páginas de las que se extrae la información de
 * eventos, cada una con un switch para ocultarla del catálogo.
 *
 * La ocultación se guarda en el navegador donde se administra (localStorage)
 * y ya filtra el catálogo completo de ese entorno (sitio público incluido).
 * Para aplicarla a todos los visitantes conviene persistir la nómina en una
 * tabla de Supabase con Edge Function de service_role.
 */
@Component({
  selector: 'app-admin-paginas',
  standalone: true,
  imports: [DecimalPipe, AdminSidebarComponent],
  templateUrl: './admin-paginas.page.html',
  styleUrls: ['./admin-panel.shared.scss', './admin-paginas.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminPaginasPage {
  private readonly eventosService = inject(EventosService);

  /** Estado de interfaz compartido (drawer con el botón ☰). */
  readonly ui = inject(AdminUiService);

  /**
   * Páginas detectadas en el CATÁLOGO COMPLETO (no solo el vigente): así una
   * página oculta sigue listada y se puede reactivar con su switch.
   */
  readonly fuentes = computed<FuenteInfo[]>(() => {
    const claveDe = (e: Evento) =>
      e.fuente && e.fuente.trim() ? e.fuente : 'Sin dato de origen';

    const totales = new Map<string, number>();
    for (const e of this.eventosService.catalogoCompleto()) {
      const clave = claveDe(e);
      totales.set(clave, (totales.get(clave) ?? 0) + 1);
    }

    const vigentes = new Map<string, number>();
    for (const e of this.eventosService.eventosVigentes()) {
      const clave = claveDe(e);
      vigentes.set(clave, (vigentes.get(clave) ?? 0) + 1);
    }

    const ocultas = this.eventosService.fuentesOcultas();
    return [...totales.entries()]
      .map(([nombre, total]) => ({
        nombre,
        total,
        vigentes: vigentes.get(nombre) ?? 0,
        oculta: ocultas.has(nombre)
      }))
      .sort(
        (a, b) => Number(b.oculta) - Number(a.oculta) || b.total - a.total
      );
  });

  readonly totalFuentes = computed(() => this.fuentes().length);
  readonly totalOcultas = computed(() => this.fuentes().filter((f) => f.oculta).length);

  /** Alterna el switch de una página: oculta ↔ visible. */
  alternar(fuente: FuenteInfo): void {
    this.eventosService.ocultarFuente(fuente.nombre, !fuente.oculta);
  }

  /** Botón "Activar todo": quita todas las ocultaciones de una vez. */
  mostrarTodas(): void {
    this.eventosService.definirFuentesOcultas([]);
  }

  /**
   * Botón "Desactivar todo": oculta todas las páginas listadas de una vez.
   * Nota: si luego aparece una página nueva en el catálogo, entra visible
   * (la nómina describe las páginas conocidas al momento).
   */
  ocultarTodas(): void {
    this.eventosService.definirFuentesOcultas(this.fuentes().map((f) => f.nombre));
  }
}
