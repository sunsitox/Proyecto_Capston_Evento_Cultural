import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  input,
  output,
  signal
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { Evento, EstadoEvento, ModalidadEvento } from '../../../core/models/evento.model';
import { RecomendacionService } from '../../../core/services/recomendacion.service';
import { RecommendationReason } from '../../../core/models/recomendacion.model';
import { EventInterestActionsComponent } from '../event-interest-actions/event-interest-actions.component';

const ESTADO_ETIQUETA: Record<EstadoEvento, string> = {
  proximo: 'Próximo',
  hoy: 'Hoy',
  en_curso: 'En curso',
  suspendido: 'Suspendido',
  cancelado: 'Cancelado'
};

const ICONO_MODALIDAD: Record<ModalidadEvento, string> = {
  'Presencial': 'location-outline',
  'Virtual': 'videocam-outline',
  'Híbrido': 'layers-outline'
};

/**
 * Tarjeta de evento.
 *
 * Una sola acción visible en la tarjeta ("Me interesa", discreta) y un
 * menú contextual (⋯) con las acciones secundarias "Ver similares" y
 * "No me interesa". Abrir la ficha registra la señal ver_detalle.
 *
 * "No me interesa" anima la salida de la tarjeta (desvanecer +
 * contraer) y luego emite el evento al contenedor, que la retira del
 * listado. Respeta prefers-reduced-motion vía tokens globales.
 */
@Component({
  selector: 'app-evento-card',
  standalone: true,
  imports: [DatePipe, RouterLink, IonIcon, EventInterestActionsComponent],
  templateUrl: './evento-card.component.html',
  styleUrl: './evento-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EventoCardComponent {
  private readonly recomendacion = inject(RecomendacionService);

  readonly evento = input.required<Evento>();
  readonly layout = input<'grid' | 'lista'>('grid');

  /** Motivo de recomendación a mostrar (sólo en Para ti). */
  readonly motivo = input<RecommendationReason | null>(null);

  /**
   * Ocultar la acción "Me interesa" (la ficha tiene su propio bloque de
   * acciones principal; la tarjeta de similares queda ligera).
   */
  readonly mostrarAcciones = input(true);

  /** Etiqueta del botón "Ver similares" (contextual por pantalla). */
  readonly etiquetaSimilares = input<string | null>(null);

  readonly meInteresaCambiado = output<{ eventoId: string; activo: boolean }>();
  readonly verSimilaresClick = output<string>();

  /**
   * El contenedor espera este evento antes de retirar el elemento:
   * llega DESPUÉS de la animación de salida (210 ms), de modo que la
   * señal "no_me_interesa" se registra sin cortar la animación.
   */
  readonly salidaTerminada = output<string>();

  /** Menú contextual abierto (⋯). */
  readonly menuAbierto = signal(false);

  /** Animación de salida en curso (no interceptar más clicks). */
  readonly saliendo = signal(false);

  /** Mapa categoría → clase modificadora de color (.ec-cat--*) */
  private readonly CAT_CLASS: Record<string, string> = {
    'Música': 'musica',
    'Arte y Cultura': 'arte',
    'Gastronomía': 'gastro',
    'Ferias y Mercados': 'ferias',
    'Municipal': 'municipal',
    'Familiar': 'familiar',
    'Deportivo': 'deporte'
  };

  readonly catClass = computed(
    () => 'ec-cat--' + (this.CAT_CLASS[this.evento()?.categoria] ?? 'musica')
  );

  /** Suspendidos y cancelados se ven atenuados en el catálogo */
  readonly esInactiva = computed(
    () =>
      this.evento()?.estado === 'suspendido' || this.evento()?.estado === 'cancelado'
  );

  readonly estadoEtiqueta = computed(
    () => ESTADO_ETIQUETA[this.evento()?.estado ?? 'proximo']
  );

  /**
   * Formato de fecha: el año sólo se muestra cuando aporta información.
   * El catálogo real trae exposiciones y muestras permanentes que empiezan
   * años atrás y terminan años después ("1 ene – 1 ene" era ambiguo).
   */
  readonly formatoInicio = computed(() => {
    const anio = anioDe(this.evento()?.fecha);
    return anio && anio !== ANIO_ACTUAL ? 'd MMM y' : 'd MMM';
  });

  readonly formatoTermino = computed(() => {
    const inicio = anioDe(this.evento()?.fecha);
    const termino = anioDe(this.evento()?.fechaTermino);
    if (!termino) return 'd MMM';
    return termino !== inicio || termino !== ANIO_ACTUAL ? 'd MMM y' : 'd MMM';
  });

  readonly iconoModalidad = computed(
    () => ICONO_MODALIDAD[this.evento()?.modalidad ?? 'Presencial']
  );

  /** "Me interesa" activo para este evento (memoria de la visita). */
  readonly meInteresaActivo = computed(
    () => this.recomendacion.tieneSenal(this.evento()?.id ?? '', 'me_interesa')
  );

  onAbrirDetalle(): void {
    // Señal: abrir el detalle del evento = interés leve.
    this.recomendacion.registrarSenal('ver_detalle', this.evento().id);
  }

  onMeInteresa(cambio: { eventoId: string; activo: boolean }): void {
    this.meInteresaCambiado.emit(cambio);
  }

  toggleMenu(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.menuAbierto.update((v) => !v);
  }

  /** "No me interesa" desde el menú: anima y retira. */
  descartarDesdeMenu(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.menuAbierto.set(false);
    this.descartar();
  }

  /** "Ver similares" desde el menú (delega al contenedor). */
  similaresDesdeMenu(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.menuAbierto.set(false);
    this.verSimilaresClick.emit(this.evento().id);
  }

  /** Cierra el menú con Escape o click fuera. */
  @HostListener('document:click')
  onDocClick(): void {
    if (this.menuAbierto()) {
      this.menuAbierto.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.menuAbierto()) {
      this.menuAbierto.set(false);
    }
  }

  /** Animación de salida (200 ms) y aviso al contenedor. */
  descartar(): void {
    if (this.saliendo()) return;
    this.saliendo.set(true);
    setTimeout(() => this.salidaTerminada.emit(this.evento().id), 210);
  }
}

/** Año en curso: decide si la fecha necesita mostrar el año. */
const ANIO_ACTUAL = new Date().getFullYear();

/** Año de una fecha ISO (null si no se puede leer). */
function anioDe(iso: string | undefined): number | null {
  if (!iso) return null;
  const anio = Number(iso.slice(0, 4));
  return Number.isFinite(anio) && anio > 1900 ? anio : null;
}
