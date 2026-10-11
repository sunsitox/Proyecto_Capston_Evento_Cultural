import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import * as L from 'leaflet';
import { EventosService } from '../../core/services/eventos.service';
import { RecomendacionService } from '../../core/services/recomendacion.service';
import { EventoCardComponent } from '../../shared/components/evento-card/evento-card.component';
import { EventoCardSkeletonComponent } from '../../shared/components/evento-card-skeleton/evento-card-skeleton.component';
import { Evento } from '../../core/models/evento.model';
import {
  BottomSheetComponent
} from '../../shared/components/bottom-sheet/bottom-sheet.component';

interface PinMapa {
  evento: Evento;
  marcador: L.Marker;
}

/**
 * Mapa de eventos con Leaflet + tiles de OpenStreetMap.
 *
 * Mapa interactivo real: pan, zoom, pines vinculados a coordenadas
 * reales del catálogo y geolocalización opcional del usuario (botón
 * "Mi ubicación", con permiso del navegador). Sin API key: los tiles
 * públicos de OSM requieren únicamente atribución.
 */
@Component({
  selector: 'app-mapa',
  standalone: true,
  imports: [DatePipe, RouterLink, IonIcon, EventoCardComponent, EventoCardSkeletonComponent, BottomSheetComponent],
  templateUrl: './mapa.page.html',
  styleUrl: './mapa.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MapaPage implements AfterViewInit, OnDestroy {
  private readonly eventosService = inject(EventosService);
  private readonly recomendacion = inject(RecomendacionService);
  private readonly router = inject(Router);

  /**
   * Opciones de filtro tomadas del catálogo real (las mismas facetas que
   * usa Descubrir): regiones, comunas y categorías que existen en los datos.
   */
  private readonly facetas = this.eventosService.facetas;

  readonly categorias = computed(() =>
    this.facetas().categorias.map((o) => o.valor)
  );
  readonly regiones = computed(() => this.facetas().regiones.map((o) => o.valor));
  readonly modalidades = computed(() =>
    this.facetas().modalidades.map((o) => o.valor)
  );
  /** Comunas de la región elegida (todas las del catálogo si no hay región). */
  readonly comunas = computed(() =>
    (this.filtroRegion()
      ? this.eventosService.comunasDe(this.filtroRegion())
      : this.facetas().comunas
    ).map((o) => o.valor)
  );

  readonly cargando = this.eventosService.cargando;
  readonly error = this.eventosService.error;

  readonly hoy = EventosService.hoyISO();

  // Filtros
  readonly filtroFecha = signal('');
  readonly filtroCategoria = signal('');
  readonly filtroRegion = signal('');
  readonly filtroComuna = signal('');
  readonly filtroModalidad = signal('');

  /** Evento resaltado desde la lista o el pin. */
  readonly destacado = signal<string | null>(null);

  /** Bottom sheet de filtros (móvil): fecha fuera, resto dentro. */
  readonly filtrosAbiertos = signal(false);

  /** Eventos vigentes con filtros aplicados (sin los descartados). */
  readonly eventosFiltrados = computed<Evento[]>(() => {
    const fecha = this.filtroFecha();
    const categoria = this.filtroCategoria();
    const region = this.filtroRegion();
    const comuna = this.filtroComuna();
    const modalidad = this.filtroModalidad();

    return this.eventosService
      .obtenerVigentes()
      .filter((e) => {
        const coincideFecha = !fecha || e.fecha <= fecha && (e.fechaTermino ?? e.fecha) >= fecha;
        const coincideCategoria =
          !categoria || e.categorias.includes(categoria as never);
        return (
          coincideFecha &&
          coincideCategoria &&
          (!region || e.region === region) &&
          (!comuna || e.comuna === comuna) &&
          (!modalidad || e.modalidad === modalidad) &&
          !this.recomendacion.estaOculto(e.id)
        );
      })
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  });

  /**
   * Lista accesible: se pinta por bloques (el catálogo real tiene más de
   * mil eventos) y vuelve al primer bloque cuando cambian los filtros.
   */
  /**
   * Ubicación del usuario y radio de búsqueda alrededor de ella. Al pedir
   * «Mi ubicación» de nuevo se amplía el radio (10 → 25 → 50 → 100 km),
   * como acercar/alejar en Google Maps pero del lado del radio.
   */
  readonly posicionUsuario = signal<{ lat: number; lng: number } | null>(null);
  readonly radiosDisponibles = [10, 25, 50, 100] as const;
  readonly radioKm = signal<number>(this.radiosDisponibles[0]);

  private distanciaKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const R = 6371; // radio terrestre medio, km
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  readonly pines = computed<Evento[]>(() => {
    const conCoordenadas = this.eventosFiltrados().filter((e) => !!e.coordenadas);
    const pos = this.posicionUsuario();
    if (!pos) return conCoordenadas;
    const radio = this.radioKm();
    return conCoordenadas.filter(
      (e) => this.distanciaKm(pos, e.coordenadas!) <= radio
    );
  });

  /** Eventos ya dibujados en el mapa (para el badge del resumen). */
  readonly conUbicacion = computed(() => this.pines().length);

  /** Coordenadas sin posición para el aviso accesible. */
  readonly sinCoordenadas = computed(
    () => this.eventosFiltrados().length - this.pines().length
  );

  /** Estado de la geolocalización del usuario. */
  readonly ubicacionEstado = signal<'inactiva' | 'cargando' | 'lista' | 'denegada'>('inactiva');

  ngAfterViewInit(): void {
    // El monta se hace vía effect cuando el lienzo existe en el DOM.
  }

  ngOnDestroy(): void {
    this.mapa?.remove();
    this.mapa = null;
  }

  private inicializarMapa(): void {
    const contenedor = this.lienzoRef()?.nativeElement;
    if (!contenedor || this.mapa) return;

    this.zona.runOutsideAngular(() => {
      const mapa = L.map(contenedor, {
        center: [-35.5, -71.0], // Chile continental
        zoom: 4.5,
        zoomControl: true,
        attributionControl: true
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: this.atribucion,
        maxZoom: 19
      }).addTo(mapa);

      this.capaPines = L.layerGroup().addTo(mapa);
      this.mapa = mapa;
      this.initialised.set(true);
    });

    this.dibujarPines(this.pines());
  }

  /** Icono de pin propio del design system (SVG color marca), más
   *  pequeño que el de Leaflet y anclado en la punta. */
  private static readonly pinIcon = L.divIcon({
    className: 'ec-mapa__pin',
    html:
      '<svg viewBox="0 0 24 24" width="30" height="42" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="#7a4f2e" stroke="#fffdf9" stroke-width="1.5"/>' +
      '<circle cx="12" cy="12" r="5" fill="#fffdf9"/></svg>',
    iconSize: [30, 42],
    iconAnchor: [15, 42],
    popupAnchor: [0, -42]
  });

  private dibujarPines(lista: Evento[]): void {
    if (!this.mapa || !this.capaPines) return;
    this.zona.runOutsideAngular(() => {
      this.capaPines!.clearLayers();
      for (const evento of lista) {
        const c = evento.coordenadas!;
        const marcador = L.marker([c.lat, c.lng], {
          icon: MapaPage.pinIcon,
          title: evento.titulo,
          keyboard: false,
          riseOnHover: true
        });
        marcador.addTo(this.capaPines!);
        marcador.on('click', () => {
          // Sincroniza el "destacado" con la lista accesible al abrir la tarjeta.
          this.zona.run(() => this.destacado.set(evento.id));
        });
        marcador.bindPopup(
          `
          <div class="ec-mapa__popup-card">
            <img src="${this.escapar(evento.imagen)}" alt="" />
            <div class="ec-mapa__popup-info">
              <p class="ec-mapa__popup-meta">${this.escapar(evento.comuna)}</p>
              <h3>${this.escapar(evento.titulo)}</h3>
              <p class="ec-mapa__popup-fecha">${this.escapar(
                this.fechaPopup(evento.fecha)
              )} · ${this.escapar(evento.hora)}</p>
              <a href="/evento/${this.escapar(evento.id)}">Ver ficha</a>
            </div>
          </div>
          `,
          {
            className: 'ec-mapa__popup',
            maxWidth: 264,
            minWidth: 240,
            closeButton: true,
            autoPan: true,
            autoPanPadding: [56, 24],
            keepInView: true
          }
        );
      }
    });
  }

  /** Centra el mapa en un evento y abre su popup. */
  verEnMapa(eventoId: string): void {
    const pin = this.pines().find((e) => e.id === eventoId);
    if (!pin || !this.mapa) return;
    this.mapa.setView([pin.coordenadas!.lat, pin.coordenadas!.lng], 14);
    this.destacado.set(eventoId);
    const marcadores = Object.values((this.capaPines as unknown as {_layers?: Record<string, L.Marker>})._layers ?? {});
    const marcador = marcadores.find(
      (m) => Math.abs((m.getLatLng().lat - pin.coordenadas!.lat)) < 1e-7 &&
             Math.abs((m.getLatLng().lng - pin.coordenadas!.lng)) < 1e-7
    );
    marcador?.openPopup();
  }

  /** Fecha corta para el popup: "11 jun". */
  private fechaPopup(iso: string): string {
    const fecha = new Date(iso);
    if (Number.isNaN(fecha.getTime())) return iso;
    return fecha.toLocaleDateString('es-CL', {
      day: 'numeric',
      month: 'short'
    });
  }

  private escapar(texto: string): string {
    return String(texto)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }

  /** Solicita la ubicación actual del usuario (opt-in) y dibuja su marca.
   *  Si ya hay ubicación, cada pulsación amplía el radio de búsqueda. */
  pedirMiUbicacion(): void {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this.ubicacionEstado.set('denegada');
      return;
    }
    if (this.posicionUsuario()) {
      const i = this.radiosDisponibles.indexOf(this.radioKm() as never);
      const siguiente = this.radiosDisponibles[
        Math.min(i + 1, this.radiosDisponibles.length - 1)
      ];
      this.radioKm.set(siguiente);
      this.actualizarRadioCirculo();
      return;
    }
    this.ubicacionEstado.set('cargando');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.zona.run(() => {
          const { latitude, longitude } = pos.coords;
          this.posicionUsuario.set({ lat: latitude, lng: longitude });
          this.radioKm.set(this.radiosDisponibles[0]);
          this.mapa?.setView([latitude, longitude], 11);
          this.dibujarUsuario(latitude, longitude);
          this.ubicacionEstado.set('lista');
        });
      },
      () => this.zona.run(() => this.ubicacionEstado.set('denegada')),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 }
    );
  }

  private actualizarRadioCirculo(): void {
    if (this.circuloUsuario) {
      this.circuloUsuario.setRadius(this.radioKm() * 1000);
    }
  }

  /** Etiqueta del siguiente radio (para el aria-label del botón). */
  readonly radiosSiguienteEtiqueta = computed(() => {
    const i = this.radiosDisponibles.indexOf(this.radioKm() as never);
    const siguiente = this.radiosDisponibles[Math.min(i + 1, this.radiosDisponibles.length - 1)];
    return siguiente + ' km';
  });

  private dibujarUsuario(lat: number, lng: number): void {
    if (!this.mapa) return;
    this.zona.runOutsideAngular(() => {
      this.marcadorUsuario?.remove();
      const icono = L.divIcon({
        className: 'ec-mapa__usuario',
        html: '<span class="ec-mapa__usuario-punto"></span>',
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      });
      this.marcadorUsuario = L.marker([lat, lng], {
        icon: icono,
        title: 'Mi ubicación',
        keyboard: false,
        zIndexOffset: 1000
      }).addTo(this.mapa!);
      this.circuloUsuario?.remove();
      this.circuloUsuario = L.circle([lat, lng], {
        radius: this.radioKm() * 1000,
        color: '#7a4f2e',
        fillColor: '#7a4f2e',
        fillOpacity: 0.08,
        weight: 1
      }).addTo(this.mapa!);
    });
  }
  private readonly tamanoLista = 24;
  private readonly avanceLista = signal<{ firma: Evento[]; pagina: number } | null>(
    null
  );

  private readonly paginaLista = computed(() => {
    const firma = this.eventosFiltrados();
    const estado = this.avanceLista();
    return estado && estado.firma === firma ? estado.pagina : 1;
  });

  readonly eventosLista = computed(() =>
    this.eventosFiltrados().slice(0, this.paginaLista() * this.tamanoLista)
  );

  readonly hayMasLista = computed(
    () => this.eventosLista().length < this.eventosFiltrados().length
  );

  verMasLista(): void {
    this.avanceLista.set({
      firma: this.eventosFiltrados(),
      pagina: this.paginaLista() + 1
    });
  }

  // ================= Leaflet =================
  private readonly zona = inject(NgZone);
  private readonly lienzoRef = viewChild<ElementRef<HTMLElement>>('lienzoRef');

  private mapa: L.Map | null = null;
  private capaPines: L.LayerGroup | null = null;
  private marcadorUsuario: L.Marker | null = null;
  private circuloUsuario: L.Circle | null = null;
  private readonly initialised = signal(false);

  /** Atribución de tiles requerida por OpenStreetMap. */
  readonly atribucion =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

  // Los effects viven como field initializer (injection context válido).
  private readonly montarMapa = effect(() => {
    if (this.lienzoRef() && !this.mapa) {
      this.inicializarMapa();
    }
  });

  private readonly sincronizarPines = effect(() => {
    if (!this.initialised()) return;
    const lista = this.pines();
    if (this.mapa) this.dibujarPines(lista);
  });

  /** Cambiar de región reinicia la comuna cuando no pertenece a ella. */
  onRegion(region: string): void {
    this.filtroRegion.set(region);
    const comuna = this.filtroComuna();
    const pertenece =
      !comuna ||
      !region ||
      this.eventosService.comunasDe(region).some((c) => c.valor === comuna);
    if (!pertenece) this.filtroComuna.set('');
  }

  readonly filtrosActivos = computed(
    () =>
      !!this.filtroFecha() ||
      !!this.filtroCategoria() ||
      !!this.filtroRegion() ||
      !!this.filtroComuna() ||
      !!this.filtroModalidad()
  );

  limpiarFiltros(): void {
    this.filtroFecha.set('');
    this.filtroCategoria.set('');
    this.filtroRegion.set('');
    this.filtroComuna.set('');
    this.filtroModalidad.set('');
  }

  /** Reintenta la carga (estado de error). */
  onReintentar(): void {
    this.eventosService.setError(null);
    this.eventosService.cargarEventos();
  }

  /** Selección de pin: resalta y muestra su mini-tarjeta. */
  seleccionarPin(eventoId: string): void {
    this.destacado.update((actual) => (actual === eventoId ? null : eventoId));
  }

  /** Abrir la ficha desde el popover también cuenta como ver_detalle. */
  registrarVerDetalle(eventoId: string): void {
    this.recomendacion.registrarSenal('ver_detalle', eventoId);
  }

  destacar(id: string | null): void {
    this.destacado.set(id);
  }

  onMeInteresa(cambio: { eventoId: string; activo: boolean }): void {
    this.recomendacion.alternarMeInteresa(cambio.eventoId, cambio.activo);
  }

  onNoMeInteresa(eventoId: string): void {
    this.recomendacion.registrarSenal('no_me_interesa', eventoId);
  }

  onVerSimilares(eventoId: string): void {
    const evento = this.eventosService.obtenerVigentes().find((e) => e.id === eventoId);
    if (!evento) return;
    this.recomendacion.registrarSenal('ver_similares', eventoId);
    this.eventosService.actualizarFiltros({ categorias: evento.categorias });
    this.eventosService.limpiarOtrosFiltros('categorias');
    this.router.navigate(['/home']);
  }
}
