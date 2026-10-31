import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { DomSanitizer } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  IonIcon,
  IonButton,
  IonButtons,
  IonToast
} from '@ionic/angular';
import { EventosService } from '../../core/services/eventos.service';
import { RecomendacionService } from '../../core/services/recomendacion.service';
import { GeocodificacionService } from '../../core/services/geocodificacion.service';
import { Coordenadas } from '../../core/models/evento.model';
import { EventoCardComponent } from '../../shared/components/evento-card/evento-card.component';
import {
  EventInterestActionsComponent
} from '../../shared/components/event-interest-actions/event-interest-actions.component';
import {
  EventoDetailSkeletonComponent
} from '../../shared/components/evento-detail-skeleton/evento-detail-skeleton.component';
import { EstadoEvento, ModalidadEvento } from '../../core/models/evento.model';

const ESTADO_ETIQUETA: Record<EstadoEvento, string> = {
  proximo: 'Próximo',
  hoy: 'Hoy',
  en_curso: 'En curso',
  suspendido: 'Suspendido',
  cancelado: 'Cancelado'
};

const ICONO_MODALIDAD: Record<EstadoEvento | ModalidadEvento, string> = {
  proximo: 'calendar-outline',
  hoy: 'time-outline',
  en_curso: 'time-outline',
  suspendido: 'pause-outline',
  cancelado: 'close-circle-outline',
  'Presencial': 'location-outline',
  'Virtual': 'videocam-outline',
  'Híbrido': 'layers-outline'
};

@Component({
  selector: 'app-detalle-evento',
  standalone: true,
  imports: [CommonModule, DatePipe, RouterLink, IonIcon, IonButton, IonButtons, IonToast, EventoCardComponent, EventInterestActionsComponent, EventoDetailSkeletonComponent],
  templateUrl: './detalle-evento.page.html',
  styleUrl: './detalle-evento.page.scss'
})
export class DetalleEventoPage {
  private readonly route = inject(ActivatedRoute);
  private readonly eventosService = inject(EventosService);
  private readonly recomendacion = inject(RecomendacionService);
  private readonly geocodificacion = inject(GeocodificacionService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly router = inject(Router);

  readonly enlaceCopiado = signal(false);

  /** Estado de carga: activa el skeleton de la ficha. */
  readonly cargando = this.eventosService.cargando;

  private readonly eventoId = this.route.snapshot.paramMap.get('id') ?? '';

  /** Ubicación resuelta por respaldo (Nominatim) para eventos sin
   *  coordenadas en la base de datos: mejora el mapa embebido y «Cómo
   *  llegar» sin escribir en Supabase. */
  readonly coordsResueltas = signal<Coordenadas | null>(null);

  constructor() {
    // Al entrar a la ficha se pide el catálogo (skeleton como en listado).
    this.eventosService.cargarEventos();

    // Con catálogo listo y evento sin coordenadas, resuelve por respaldo.
    effect(() => {
      const ev = this.evento();
      if (!ev) return;
      if (ev.coordenadas) return;
      void this.geocodificacion.coordenadaDe(ev).then((c) => {
        if (c) this.coordsResueltas.set(c);
      });
    });
  }

  readonly evento = computed(() =>
    this.eventosService.obtenerPorId(this.eventoId)
  );

  /**
   * Rango de fechas ≥ ~10 meses: el catálogo real trae exposiciones con
   * vigencia de años ("1 enero 2026 – 1 enero 2027" no aportaba nada).
   * Mostrar «Desde <inicio> · vigencia prolongada» es más claro que un
   * rango simétrico. No aplica a espacios permanentes (ya hay etiqueta).
   */
  readonly rangoProlongado = computed(() => {
    const ev = this.evento();
    if (!ev || ev.permanente || !ev.fecha || !ev.fechaTermino) return false;
    const inicio = new Date(ev.fecha + 'T12:00:00').getTime();
    const termino = new Date(ev.fechaTermino + 'T12:00:00').getTime();
    if (Number.isNaN(inicio) || Number.isNaN(termino)) return false;
    return termino - inicio >= 300 * 24 * 60 * 60 * 1000;
  });

  /**
   * Hora de término menor o igual a la de inicio: horario tipo
   * "19:00 – 01:00" que da la vuelta al reloj; mostrar hasta el
   * término era confuso (parecía un error de datos).
   */
  readonly duranteNoche = computed(() => {
    const ev = this.evento();
    if (!ev || !ev.hora || !ev.horaTermino) return false;
    return ev.horaTermino <= ev.hora;
  });

  /** Hasta 3 eventos vigentes de la misma categoría (excluye el actual) */
  readonly similares = computed(() => {
    const ev = this.evento();
    if (!ev) return [];
    return this.eventosService
      .obtenerVigentes()
      .filter(
        (o) =>
          o.id !== ev.id &&
          o.categoria === ev.categoria &&
          !this.recomendacion.estaOculto(o.id)
      )
      .slice(0, 3);
  });

  /** Alternativas vigentes cuando se llega a un evento ya vencido. */
  readonly alternativasVigentes = computed(() =>
    this.eventosService.obtenerVigentes().slice(0, 3)
  );

  /** El evento existe pero ya venció: los datos rotan y desaparecen. */
  readonly noVigente = computed(() => {
    const ev = this.evento();
    if (!ev) return false;
    // Espacio permanente (museo, centro abierto todo el año): no vence.
    if (ev.permanente) return false;
    // Sin fecha no hay forma de calcular "ya venció": no se bloquea.
    if (!ev.fecha) return false;
    const hoy = EventosService.hoyISO();
    return (ev.fechaTermino ?? ev.fecha) < hoy;
  });

  /** "Me interesa" activo para este evento (memoria de la visita). */
  readonly meInteresaActivo = computed(() => {
    const ev = this.evento();
    return !!ev && this.recomendacion.tieneSenal(ev.id, 'me_interesa');
  });

  onMeInteresa(cambio: { eventoId: string; activo: boolean }): void {
    this.recomendacion.alternarMeInteresa(cambio.eventoId, cambio.activo);
  }

  /** Señal negativa en la ficha: retira y vuelve a Descubrir. */
  onNoMeInteresa(eventoId: string): void {
    this.recomendacion.registrarSenal('no_me_interesa', eventoId);
    this.router.navigate(['/home']);
  }

  /** "Ver eventos similares": señal + Descubrir filtrado por categorías. */
  onVerSimilares(eventoId: string): void {
    const ev = this.eventosService.obtenerVigentes().find((e) => e.id === eventoId);
    if (!ev) return;
    this.recomendacion.registrarSenal('ver_similares', eventoId);
    this.eventosService.actualizarFiltros({ categorias: ev.categorias });
    this.eventosService.limpiarOtrosFiltros('categorias');
    this.router.navigate(['/home']);
  }

  /**
   * Los datos del piloto no publican URLs reales: los enlaces externos
   * se muestran como "Enlace no disponible" en lugar de un '#' muerto.
   */
  enlaceDisponible(url: string | undefined | null): boolean {
    return !!url && url !== '#';
  }

  /** Señal de interés medio: abrir ubicación / cómo llegar. */
  registrarUbicacion(): void {
    const ev = this.evento();
    if (ev) this.recomendacion.registrarSenal('ver_ubicacion', ev.id);
  }

  /** Señal de interés medio-alto: fuente oficial o inscripción. */
  registrarFuente(): void {
    const ev = this.evento();
    if (ev) this.recomendacion.registrarSenal('ver_fuente', ev.id);
  }

  estadoEtiqueta(estado: EstadoEvento): string {
    return ESTADO_ETIQUETA[estado];
  }

  iconoDe(modalidad: ModalidadEvento): string {
    return ICONO_MODALIDAD[modalidad];
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

  /** Ubicación efectiva a mostrar: coordenadas de la BD o, en su defecto,
   *  las geocodificadas por respaldo (aproximadas). */
  private readonly ubicacionEfectiva = computed<Coordenadas | null>(() => {
    const ev = this.evento();
    if (!ev) return null;
    if (ev.coordenadas) return ev.coordenadas;
    return this.coordsResueltas() ?? null;
  });

  /** Mapa embebido (Google Maps, sin API key) solo si hay lugar físico.
   *  Con coordenadas (propias o geocodificadas) se marca el punto exacto
   *  (q=lat,lng); sin ellas, la búsqueda por texto da el centrado
   *  aproximado de la comuna. */
  readonly mapaEmbed = computed(() => {
    const ev = this.evento();
    if (!ev || ev.modalidad === 'Virtual') return null;
    const ubi = this.ubicacionEfectiva();
    const q = ubi
      ? `${ubi.lat},${ubi.lng}`
      : encodeURIComponent(`${ev.direccion || ev.recinto}, ${ev.comuna}, ${ev.region}, Chile`);
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.google.com/maps?q=${q}&output=embed`
    );
  });

  /** Enlace a Google Maps para trazar la ruta («Cómo llegar»).
   *
   *  Con coordenadas del evento (de la BD o geocodificadas) se usa un
   *  deep link de dirección (destination=lat,lng): abre la ruta exacta
   *  desde donde esté el usuario. Sin coordenadas cae a la búsqueda por
   *  texto (dirección, comuna y región), que es aproximada. */
  mapsUrl(): string {
    const ev = this.evento();
    if (!ev) return 'https://maps.google.com';
    const ubi = this.ubicacionEfectiva();
    if (ubi) {
      return `https://www.google.com/maps/dir/?api=1&destination=${ubi.lat},${ubi.lng}`;
    }
    const query = encodeURIComponent(`${ev.direccion}, ${ev.comuna}, ${ev.region}, Chile`);
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
  }



  /**
   * Comparte el evento vía Web Share API cuando esté disponible.
   * Fallback: copia la URL al portapapeles y muestra confirmación.
   */
  async compartir(): Promise<void> {
    const ev = this.evento();
    if (!ev) return;

    const url = typeof window !== 'undefined' ? window.location.href : '';
    const datos: ShareData = {
      title: ev.titulo,
      text: ev.permanente
        ? `${ev.titulo} — ${ev.recinto}, ${ev.comuna}`
        : `${ev.titulo} — ${ev.fecha} en ${ev.comuna}`,
      url
    };

    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share(datos);
        return;
      } catch (err) {
        // El usuario canceló o no se pudo: caemos al fallback.
        if ((err as DOMException)?.name === 'AbortError') return;
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        this.enlaceCopiado.set(true);
        return;
      } catch {
        /* sin permisos de clipboard, lo dejamos silencioso */
      }
    }
  }
}
