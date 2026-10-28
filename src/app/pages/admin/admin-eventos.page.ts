import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { AdminSidebarComponent } from './admin-sidebar.component';
import { AdminUiService } from './admin-ui.service';
import { AdminEventosService, AdminEventoFila } from '../../core/services/admin-eventos.service';

/** Columnas de la tabla por las que se puede ordenar (las 5 primeras). */
type OrdenCampo = 'titulo' | 'fecha' | 'comuna' | 'origen' | 'estado';

/**
 * Orden semántico del estado (no alfabético): próximo → hoy → en curso →
 * vencido, refleja el ciclo de vida del evento.
 */
const RANK_ESTADO: Record<AdminEventoFila['estado'], number> = {
  proximo: 0,
  hoy: 1,
  en_curso: 2,
  vencido: 3
};

/** Fecha de reserva para que "Sin fecha" quede al final de la ordenación. */
const FECHA_INFINITA = '9999-12-31';

/**
 * Sección "Eventos" del panel: moderación del catálogo real en Supabase, en
 * dos grupos con paginación del lado del servidor:
 *
 *  - Validados: eventos publicados (status 'published'), visibles al público.
 *    Cada fila tiene un interruptor de VISIBILIDAD (desactivar/reactivar,
 *    columna is_suppressed).
 *  - En validación: borradores (status 'draft', incluidas las publicaciones
 *    nuevas de organizadores) con botón de validar (publicar).
 *
 * RENDIMIENTO: el servidor devuelve páginas de 60 filas; "Mostrar más" pide
 * la siguiente. La búsqueda consulta el motor (debounce 400 ms). El cliente
 * guarda en memoria sólo las filas ya mostradas (más el bloque en curso).
 */
@Component({
  selector: 'app-admin-eventos',
  standalone: true,
  imports: [DatePipe, DecimalPipe, AdminSidebarComponent],
  templateUrl: './admin-eventos.page.html',
  styleUrls: ['./admin-panel.shared.scss', './admin-eventos.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminEventosPage {
  private readonly adminEventos = inject(AdminEventosService);

  /** Estado de interfaz compartido (drawer con el botón ☰). */
  readonly ui = inject(AdminUiService);

  readonly pestana = this.adminEventos.pestana;
  readonly conteos = this.adminEventos.conteos;
  readonly cargando = this.adminEventos.cargando;
  readonly cargandoMas = this.adminEventos.cargandoMas;
  readonly hayMas = this.adminEventos.hayMas;
  readonly error = this.adminEventos.error;
  readonly masivaEnMarcha = this.adminEventos.masivaEnMarcha;

  /** Texto del buscador (signal local para no consultar en cada tecla). */
  readonly busqueda = signal('');
  private temporizadorBusqueda?: ReturnType<typeof setTimeout>;

  /** Alcance de un cambio masivo de visibilidad: pestaña actual o todo. */
  readonly alcanceMasivo = signal<'grupo' | 'todos'>('grupo');
  /** Mensaje transitorio del último cambio masivo aplicado. */
  readonly avisoMasivo = signal<string | null>(null);

  /** Filas ya descargadas de la pestaña activa (renderizables). */
  readonly filas = this.adminEventos.filas;

  // ------------------------------------------------------------------
  // Ordenamiento por columna (las 5 primeras, ordenación del cliente)
  // ------------------------------------------------------------------

  /** Columnas ordenables y su etiqueta (cabeceras con botón). */
  readonly columnasOrdenables: ReadonlyArray<{ campo: OrdenCampo; etiqueta: string }> = [
    { campo: 'titulo', etiqueta: 'Evento' },
    { campo: 'fecha', etiqueta: 'Fecha' },
    { campo: 'comuna', etiqueta: 'Comuna' },
    { campo: 'origen', etiqueta: 'Origen' },
    { campo: 'estado', etiqueta: 'Estado' }
  ];

  /** Columna activa de orden (null = orden del servidor). */
  readonly ordenCampo = signal<OrdenCampo | null>(null);
  /** Dirección activa (false = ascendente). */
  readonly ordenDesc = signal(false);

  /** Filas de la pestaña con el orden activo aplicado. */
  readonly filasOrdenadas = computed(() => {
    const filas = [...this.filas()];
    const campo = this.ordenCampo();
    if (!campo) return filas;
    const sentido = this.ordenDesc() ? -1 : 1;
    return filas.sort((a, b) => this.comparar(a, b, campo) * sentido);
  });

  /** aria-sort de una cabecera (accesibilidad de teclado/lectores). */
  ariaSort(campo: OrdenCampo): 'ascending' | 'descending' | 'none' {
    if (this.ordenCampo() !== campo) return 'none';
    return this.ordenDesc() ? 'descending' : 'ascending';
  }

  /**
   * Ciclo de orden al pulsar una cabecera: ascendente → descendente →
   * sin orden (vuelve al orden del servidor). Reinicia a la página 1.
   */
  ordenarPor(campo: OrdenCampo): void {
    if (this.ordenCampo() === campo) {
      if (this.ordenDesc()) {
        this.ordenCampo.set(null);
      } else {
        this.ordenDesc.set(true);
      }
    } else {
      this.ordenCampo.set(campo);
      this.ordenDesc.set(false);
    }
    this.paginaExtra.set(0);
  }

  /** Comparador de una columna (es-SI, fechas ISO y estados por rango). */
  private comparar(a: AdminEventoFila, b: AdminEventoFila, campo: OrdenCampo): number {
    switch (campo) {
      case 'titulo':
        return a.titulo.localeCompare(b.titulo, 'es');
      case 'fecha':
        return (a.fecha || FECHA_INFINITA).localeCompare(b.fecha || FECHA_INFINITA);
      case 'comuna':
        return (a.comuna || 'Sin comuna').localeCompare(b.comuna || 'Sin comuna', 'es');
      case 'origen':
        return a.origen.localeCompare(b.origen, 'es');
      case 'estado':
        return RANK_ESTADO[a.estado] - RANK_ESTADO[b.estado];
    }
  }

  // ------------------------------------------------------------------
  // Paginación de la tabla (page local sobre filas ordenadas)
  // ------------------------------------------------------------------

  /** Tamaños de página que ofrece el selector previo a la tabla. */
  readonly opcionesPagina: ReadonlyArray<number> = [20, 30, 50, 100];

  /** Filas por página de la tabla (elegible en la cabecera). */
  readonly tamanoPagina = signal(20);

  /** Página excedente (0-indexada) configurable por el operador. */
  private readonly paginaExtra = signal(0);

  /** Página mostrada: ajustada si la última página se acorta (validar/masivo). */
  readonly paginaValida = computed(() =>
    Math.min(this.paginaExtra(), Math.max(0, this.totalPaginas() - 1))
  );

  /** Total de páginas de la pestaña con el orden activo. */
  readonly totalPaginas = computed(() =>
    Math.max(1, Math.ceil(this.filasOrdenadas().length / this.tamanoPagina()))
  );

  /** Filas visibles en la página mostrada. */
  readonly filasPagina = computed(() => {
    const inicio = this.paginaValida() * this.tamanoPagina();
    return this.filasOrdenadas().slice(inicio, inicio + this.tamanoPagina());
  });

  /**
   * Mueve a la primera página el tamaño de fila elegido (20/30/50/100):
   * la página activa pierde sentido con otro largo.
   */
  /** Envolvente para la plantilla: los <option> llegan como texto. */
  alCambiarPorPagina(valor: string): void {
    const n = Number(valor);
    if (Number.isFinite(n)) this.cambiarTamanoPagina(n);
  }

  cambiarTamanoPagina(n: number): void {
    if (!this.opcionesPagina.includes(n) || n === this.tamanoPagina()) return;
    this.tamanoPagina.set(n);
    this.paginaExtra.set(0);
  }
  readonly rango = computed(() => {
    const total = this.filasOrdenadas().length;
    const porPagina = this.tamanoPagina();
    const inicio = total === 0 ? 0 : this.paginaValida() * porPagina + 1;
    const fin = Math.min(total, (this.paginaValida() + 1) * porPagina);
    return { inicio, fin, total };
  });

  /**
   * Cambia de página; al pasar de la última cargada descarga el siguiente
   * bloque del servidor (carga progresiva: nunca baja TODO el catálogo).
   */
  async cambiarPagina(sentido: number): Promise<void> {
    const destino = this.paginaValida() + sentido;
    if (destino < 0) return;
    if (destino >= this.totalPaginas()) {
      if (!this.hayMas()) return;
      await this.adminEventos.cargarMas();
      // Si el bloque llegó vacío (conteo desfasado), no movemos la página.
      if (destino >= this.totalPaginas()) return;
    }
    this.paginaExtra.set(destino);
  }

  constructor() {
    void this.adminEventos.cargar();
  }

  /** true mientras esa fila tiene un cambio en curso (deshabilitar controles). */
  cambiando(id: string): boolean {
    return this.adminEventos.cambiando().has(id);
  }

  /** Etiqueta del estado técnico para el chip de la fila. */
  etiquetaEstado(estado: AdminEventoFila['estado']): string {
    const ETIQUETAS: Record<AdminEventoFila['estado'], string> = {
      proximo: 'Próximo',
      hoy: 'Hoy',
      en_curso: 'En curso',
      vencido: 'Vencido'
    };
    return ETIQUETAS[estado];
  }

  /** Clase del chip según el estado (severidad). */
  claseEstado(estado: AdminEventoFila['estado']): string {
    switch (estado) {
      case 'vencido':
        return 'peligro';
      case 'en_curso':
      case 'hoy':
        return 'activo';
      default:
        return 'proximo';
    }
  }

  /** Cambia de pestaña (el servicio recarga desde la página 0). */
  cambiarPestana(p: 'validados' | 'en_validacion'): void {
    this.paginaExtra.set(0);
    void this.adminEventos.cambiarPestana(p);
  }

  /** Búsqueda con debounce: consulta al motor 400 ms después de la última tecla. */
  alEscribirBusqueda(valor: string): void {
    this.busqueda.set(valor);
    clearTimeout(this.temporizadorBusqueda);
    this.temporizadorBusqueda = setTimeout(() => {
      this.paginaExtra.set(0);
      void this.adminEventos.aplicarBusqueda(valor.trim());
    }, 400);
  }

  /** Reintenta la carga (botón del error). */
  reintentar(): void {
    void this.adminEventos.cargar();
  }

  /** Interruptor de visibilidad de una fila. */
  cambiarVisibilidad(fila: AdminEventoFila, visible: boolean): void {
    void this.adminEventos.definirVisibilidad(fila, visible);
  }

  /** elige el alcance del cambio masivo. */
  cambiarAlcanceMasivo(alcance: 'grupo' | 'todos'): void {
    this.alcanceMasivo.set(alcance);
    this.avisoMasivo.set(null);
  }

  /** Cantidad de eventos que tocaría el cambio masivo según el alcance. */
  cantidadSegunAlcance(): number {
    if (this.alcanceMasivo() === 'todos') return this.conteos().total;
    return this.pestana() === 'validados' ? this.conteos().validados : this.conteos().enValidacion;
  }

  /**
   * ACCIÓN MASIVA: activa o desactiva la visibilidad pública de todo un
   * grupo (la pestaña activa) o de todo el catálogo. Pide confirmación
   * mostrando la cantidad exacta antes de tocar la base.
   */
  async visibilidadMasiva(visible: boolean): Promise<void> {
    if (this.masivaEnMarcha()) return;
    const todos = this.alcanceMasivo() === 'todos';
    const grupo = todos ? 'todos' : this.pestana();
    const cantidad = this.cantidadSegunAlcance();
    const nombreGrupo = todos
      ? 'TODOS los eventos (validados y en validación)'
      : grupo === 'validados'
        ? 'los eventos VALIDADOS'
        : 'los eventos EN VALIDACIÓN';
    const accion = visible ? 'activar' : 'desactivar';
    const ok = confirm(
      `¿Seguro que quieres ${accion} ${cantidad} de ${nombreGrupo}?\n\n` +
        (visible
          ? 'Volverán a aparecer en el catálogo público.'
          : 'Dejarán de verse al público hasta que los reactives.')
    );
    if (!ok) return;
    this.avisoMasivo.set(null);
    try {
      const afectados = await this.adminEventos.visibilidadMasiva(grupo, visible);
      this.avisoMasivo.set(
        afectados === 1
          ? 'Se aplicó a 1 evento.'
          : `Se aplicó a ${afectados} eventos.`
      );
    } catch {
      // El servicio ya expone el fallo en su señal «error».
      this.avisoMasivo.set(null);
    }
  }

  /** Botón de la bandeja "En validación": publica el borrador. */
  validar(fila: AdminEventoFila): void {
    void this.adminEventos.validar(fila);
  }
}
