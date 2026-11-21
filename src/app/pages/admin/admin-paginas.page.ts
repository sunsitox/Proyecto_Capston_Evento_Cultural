import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AdminSidebarComponent } from './admin-sidebar.component';
import { AdminUiService } from './admin-ui.service';
import { AdminFuentesService } from '../../core/services/admin-fuentes.service';
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
 * La nómina es GLOBAL (CP-F3-ADM-005): vive en la tabla `source_visibility` y
 * la escribe la Edge Function `admin-fuentes` con service_role. Todos los
 * visitantes la leen al cargar el catálogo, así que el cambio aplica al sitio
 * completo y no solo al navegador del administrador.
 */
@Component({
  selector: 'app-admin-paginas',
  standalone: true,
  imports: [AdminSidebarComponent],
  templateUrl: './admin-paginas.page.html',
  styleUrls: ['./admin-panel.shared.scss', './admin-paginas.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminPaginasPage {
  private readonly eventosService = inject(EventosService);
  private readonly adminFuentes = inject(AdminFuentesService);

  /** Estado de interfaz compartido (drawer con el botón ☰). */
  readonly ui = inject(AdminUiService);

  /** Cambio en curso: deshabilita switches y acciones de lote. */
  readonly guardando = signal(false);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);

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

  /** Alterna el switch de una página: oculta ↔ visible para todo el sitio. */
  async alternar(fuente: FuenteInfo): Promise<void> {
    const mensaje = fuente.oculta
      ? `Página «${fuente.nombre}» visible para todos los visitantes.`
      : `Página «${fuente.nombre}» oculta para todos los visitantes.`;
    await this.ejecutar(
      () => this.adminFuentes.definir(fuente.nombre, !fuente.oculta),
      mensaje
    );
  }

  /** Botón "Activar todo": vuelve a mostrar todas las páginas del catálogo. */
  async mostrarTodas(): Promise<void> {
    await this.ejecutar(
      () => this.adminFuentes.definirTodas(this.fuentes().map((f) => f.nombre), false),
      'Todas las páginas quedaron visibles para todos los visitantes.'
    );
  }

  /** Botón "Desactivar todo": oculta todas las páginas listadas. */
  async ocultarTodas(): Promise<void> {
    await this.ejecutar(
      () => this.adminFuentes.definirTodas(this.fuentes().map((f) => f.nombre), true),
      'Todas las páginas quedaron ocultas para todos los visitantes.'
    );
  }

  /**
   * Ejecuta el cambio en la Edge Function y aplica la nómina devuelta por el
   * servidor: la interfaz nunca inventa el estado, lo confirma contra la BD.
   */
  private async ejecutar(
    accion: () => Promise<string[]>,
    mensaje: string
  ): Promise<void> {
    if (this.guardando()) return;
    this.guardando.set(true);
    this.error.set(null);
    this.aviso.set(null);
    try {
      const ocultas = await accion();
      this.eventosService.aplicarFuentesOcultasDesdeServidor(ocultas);
      this.aviso.set(mensaje);
    } catch (e) {
      this.error.set(
        e instanceof Error ? e.message : 'No se pudo guardar el cambio. Intenta de nuevo.'
      );
    } finally {
      this.guardando.set(false);
    }
  }
}
