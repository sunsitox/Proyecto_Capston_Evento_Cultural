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
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { Router, RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import * as L from 'leaflet';
import { EventosService } from '../../core/services/eventos.service';
import { RecomendacionService } from '../../core/services/recomendacion.service';
import { GeocodificacionService } from '../../core/services/geocodificacion.service';
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
 * Representación de un pin según zoom:
 * - 'canvas' (punto circular sobre un único canvas): vista alejada
 *   (país/región).
 * - 'marker' (gota con punta del design system): vista cercana.
 * El cambio de modo ocurre al cruzar el umbral y el diffing reescribe
 * sólo lo que cambió de representación.
 */
type ModoPin = 'canvas' | 'marker';


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
  private readonly geocodificacion = inject(GeocodificacionService);
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
   * Versión de la caché de geocodificación: se incrementa cuando llega una
   * coordenada de respaldo y refresca los computed que dependen de ella.
   */
  private readonly geoVersion = signal(0);

  /** intl: los pines definidos por coordenada aproximada (respaldo). */
  readonly aproximados = computed(() => {
    this.geoVersion();
    const ids = new Set<string>();
    for (const ev of this.eventosFiltrados()) {
      if (!ev.coordenadas && this.geocodificacion.yaResuelta(ev)) ids.add(ev.id);
    }
    return ids;
  });

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

  /** Vigentes con coordenadas (base del mapa, sin filtro de radio). */
  private readonly conCoordenadasBase = computed(() =>
    this.eventosFiltrados().filter((e) => !!e.coordenadas)
  );

  /**
   * Búsqueda por ubicación: con posición activa, el radio filtra mapa Y
   * lista (antes solo filtraba pines y la lista seguía mostrando todo).
   * Sin posición, equivale a los vigentes filtrados.
   */
  readonly eventosEnRadio = computed<Evento[]>(() => {
    const pos = this.posicionUsuario();
    if (!pos) return this.eventosFiltrados();
    const radio = this.radioKm();
    return this.eventosFiltrados().filter(
      (e) => !!e.coordenadas && this.distanciaKm(pos, e.coordenadas!) <= radio
    );
  });

  /** Pines del mapa: coordenadas exactas de la BD y, además, coordenadas
   *  geocodificadas por respaldo (aproximadas) para eventos sin lat/lng.
   *  Las copias con coordenada de respaldo son clones del evento: la
   *  marca "aproximada" vive en `aproximados`, no en el modelo. */
  readonly pines = computed<Evento[]>(() => {
    this.geoVersion();
    const pos = this.posicionUsuario();
    const radio = this.radioKm();
    const salida: Evento[] = [];
    for (const ev of this.eventosFiltrados()) {
      let c = ev.coordenadas;
      if (!c) {
        const resuelta = this.geocodificacion.yaResuelta(ev);
        if (!resuelta) continue;
        c = resuelta;
      }
      if (pos && this.distanciaKm(pos, c) > radio) continue;
      salida.push(c === ev.coordenadas ? ev : { ...ev, coordenadas: c });
    }
    return salida;
  });

  /** Eventos ya dibujados en el mapa (para el badge del resumen). */
  readonly conUbicacion = computed(() => this.pines().length);

  /**
   * Tope de pines en el DOM: cientos de divIcon + popups pre-atados
   * congelan el hilo principal en móvil. Se dibuja solo lo visible.
   */
  private readonly limitePines = 250;

  /** Encuadre actual del mapa (se actualiza en moveend/zoomend). */
  private readonly regionVisible = signal<{ n: number; s: number; e: number; o: number } | null>(null);

  /** Pines dentro del encuadre, topados al límite (lo que se dibuja). */
  readonly pinesEnVista = computed<Evento[]>(() => {
    const todos = this.pines();
    const region = this.regionVisible();
    const enVista = !region
      ? todos
      : todos.filter((ev) => {
        const c = ev.coordenadas!;
        return c.lat <= region.n && c.lat >= region.s && c.lng <= region.e && c.lng >= region.o;
      });
    return enVista.slice(0, this.limitePines);
  });

  /** Cuántos pines quedan fuera del dibujo (por tope o encuadre). */
  readonly pinesRecortados = computed(
    () => this.pines().length - this.pinesEnVista().length
  );

  /**
   * Filtrados sin ninguna ubicación (ni exacta ni aproximada) (independiente
   * del radio: antes, con ubicación activa, los fuera de radio se contaban
   * erróneamente como "sin ubicación").
   */
  readonly sinCoordenadas = computed(
    () => this.eventosFiltrados().length - this.pines().length
  );

  /** Estado de la geolocalización del usuario. */
  readonly ubicacionEstado = signal<'inactiva' | 'cargando' | 'lista' | 'denegada' | 'indisponible'>('inactiva');

  ngAfterViewInit(): void {
    // El monta se hace vía effect cuando el lienzo existe en el DOM.
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined' && this.onVentanaResize) {
      window.removeEventListener('resize', this.onVentanaResize);
    }
    this.mapa?.remove();
    this.mapa = null;
  }

  /** DEF-QA-001: Leaflet mide el lienzo al crearse; en móvil el contenedor
   *  aún puede estar a tamaño 0 (skeleton / transición). Revalida tras el
   *  montaje y en cada resize para completar los mosaicos. */
  private readonly onVentanaResize = (): void => {
    this.mapa?.invalidateSize(false);
  };

  private invalidarTamanoMapa(): void {
    const mapa = this.mapa;
    if (!mapa || typeof window === 'undefined') return;
    window.setTimeout(() => mapa.invalidateSize(false), 120);
    window.setTimeout(() => mapa.invalidateSize(false), 400);
  }

  private inicializarMapa(): void {
    const contenedor = this.lienzoRef()?.nativeElement;
    if (!contenedor || this.mapa) return;

    this.zona.runOutsideAngular(() => {
      const mapa = L.map(contenedor, {
        center: [-35.5, -71.0], // Chile continental
        zoom: 4.5,
        zoomControl: true,
        attributionControl: true,
        // Menos trabajo por frame: canvas para vectores y sin rebote.
        preferCanvas: true,
        zoomSnap: 0.5,
        inertiaMaxSpeed: 1200
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: this.atribucion,
        maxZoom: 19,
        // No pedir mosaicos a cada pixel de paneo: espera a soltar.
        updateWhenIdle: true,
        keepBuffer: 2,
        updateInterval: 200
      }).addTo(mapa);

      this.capaPines = L.layerGroup().addTo(mapa);
      this.mapa = mapa;
      this.initialised.set(true);
      const publicarEncuadre = (): void => {
        try {
          const b = mapa.getBounds();
          const region = { n: b.getNorth(), s: b.getSouth(), e: b.getEast(), o: b.getWest() };
          this.zona.run(() => this.regionVisible.set(region));
        } catch {
          /* mapa aún sin tamaño: se reintenta en el siguiente evento */
        }
      };
      mapa.on('moveend zoomend', publicarEncuadre);
      publicarEncuadre();
      window.addEventListener('resize', this.onVentanaResize);
      window.setTimeout(() => { mapa.invalidateSize(false); publicarEncuadre(); }, 120);
      window.setTimeout(() => { mapa.invalidateSize(false); publicarEncuadre(); }, 400);
    });

    this.dibujarPines(this.pinesEnVista());
  }

  /**
   * Icono de pin del design system: gota dibujada DIRECTAMENTE en el
   * sistema 30×42 (antes se estiraba un 24×24 y salía deformada/planas).
   * Estructura: cabeza circular (r 13.5 en cy 13.5) + curvas a la punta
   * en (15, 41) con borde crema de 1.5; la punta queda en el iconAnchor
   * [15, 42] → toca exactamente la coordenada del evento.
   */
  private static readonly pinIcon = L.divIcon({
    className: 'ec-mapa__pin',
    html:
      '<svg viewBox="0 0 30 42" width="30" height="42" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path d="M15 41 C 6.5 28.5, 1.5 20, 1.5 13.5 A 13.5 13.5 0 1 1 28.5 13.5 C 28.5 20, 23.5 28.5, 15 41 Z" fill="#7a4f2e" stroke="#fffdf9" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<circle cx="15" cy="13.5" r="5.5" fill="#fffdf9"/></svg>',
    iconSize: [30, 42],
    iconAnchor: [15, 42],
    popupAnchor: [0, -42]
  });

  /** HTML del popup de un evento (se genera solo al abrir, no por pin). */
  private popupHtml(evento: Evento): string {
    const aproximado = this.aproximados().has(evento.id)
      ? ` · <em>ubicación aproximada</em>`
      : '';
    return (
      `<div class="ec-mapa__popup-card">` +
      `<img src="${this.escapar(evento.imagen)}" alt="" />` +
      `<div class="ec-mapa__popup-info">` +
      `<p class="ec-mapa__popup-meta">${this.escapar(evento.comuna)}${aproximado}</p>` +
      `<h3>${this.escapar(evento.titulo)}</h3>` +
      `<p class="ec-mapa__popup-fecha">${this.escapar(
        evento.permanente
          ? 'Vigencia permanente'
          : [this.fechaPopup(evento.fecha), evento.hora && `${evento.hora} hrs`]
              .filter(Boolean)
              .join(' · ')
      )}</p>` +
      `<a href="/evento/${this.escapar(evento.id)}">Ver ficha</a>` +
      `</div></div>`
    );
  }

  /** Abre el popup de un evento en su posición (perezoso). */
  private abrirPopup(evento: Evento): void {
    if (!this.mapa) return;
    const c = evento.coordenadas!;
    L.popup({
      className: 'ec-mapa__popup',
      maxWidth: 264,
      minWidth: 240,
      closeButton: true,
      autoPan: true,
      autoPanPadding: [56, 24],
      keepInView: true
    })
      .setLatLng([c.lat, c.lng])
      .setContent(this.popupHtml(evento))
      .openOn(this.mapa);
  }

  /**
   * Caché de pins activos por id (diffing): reconstruir el DOM de los
   * marcadores en cada paneo era el mayor costo; sólo cambia add/remove.
   */
  /** Umbral de zoom: por debajo → puntos canvas; igual o mayor → gota. */
  private static readonly UMBRAL_ARTES = 12;

  private readonly cachePines = new Map<
    string,
    { kind: ModoPin; capa: L.Marker | L.CircleMarker }
  >();
  private firmaPines = '';
  private modoPines: ModoPin = 'marker';

  private dibujarPines(lista: Evento[]): void {
    const mapa = this.mapa;
    if (!mapa || !this.capaPines) return;

    const modo: ModoPin =
      (mapa.getZoom() ?? 0) < MapaPage.UMBRAL_ARTES ? 'canvas' : 'marker';
    const firma = lista.map((e) => e.id).join('|');

    // SKIP total: mismos ids Y mismo modo (paneo corto estable).
    if (firma === this.firmaPines && modo === this.modoPines) return;
    this.firmaPines = firma;
    this.modoPines = modo;

    this.zona.runOutsideAngular(() => {
      const presentes = new Set(lista.map((e) => e.id));

      // 1) Retirar lo que salió de vista O cambió de representación
      //    (punto ↔ gota al cruzar el umbral de zoom).
      for (const [id, entrada] of this.cachePines) {
        if (!presentes.has(id) || entrada.kind !== modo) {
          this.capaPines!.removeLayer(entrada.capa);
          this.cachePines.delete(id);
        }
      }

      // 2) Crear sólo los nuevos (los demás se reutilizan intactos).
      for (const evento of lista) {
        if (this.cachePines.has(evento.id)) continue;
        const c = evento.coordenadas!;
        const capa: L.Marker | L.CircleMarker =
          modo === 'marker'
            ? L.marker([c.lat, c.lng], {
                icon: MapaPage.pinIcon,
                title: evento.titulo,
                keyboard: false,
                riseOnHover: true
              })
            : L.circleMarker([c.lat, c.lng], {
                radius: 7,
                color: '#fffdf9',
                weight: 2,
                fillColor: '#7a4f2e',
                fillOpacity: 0.95
              });
        capa.addTo(this.capaPines!);
        capa.on('click', () => {
          this.zona.run(() => this.destacado.set(evento.id));
          this.abrirPopup(evento);
        });
        this.cachePines.set(evento.id, { kind: modo, capa });
      }
    });
  }

  /** Centra el mapa en un evento y abre su popup. */
  verEnMapa(eventoId: string): void {
    const pin = this.pines().find((e) => e.id === eventoId);
    if (!pin || !this.mapa) return;
    this.mapa.setView([pin.coordenadas!.lat, pin.coordenadas!.lng], 14);
    this.destacado.set(eventoId);
    this.abrirPopup(pin);
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

  /** ¿El radio ya está al máximo? (la siguiente pulsación lo desactiva). */
  readonly radioEsMaximo = computed(
    () => this.radioKm() >= this.radiosDisponibles[this.radiosDisponibles.length - 1]
  );

  /** Solicita la ubicación actual del usuario (opt-in) y dibuja su marca.
   *  Con ubicación activa, cada pulsación amplía el radio (10 → 25 → 50 →
   *  100 km); en el máximo, la siguiente pulsación quita el filtro — antes
   *  no había forma de desactivarlo y el mapa ni se reencuadraba.
   *
   *  En la APK Android se usa el plugin @capacitor/geolocation: sin él, el
   *  WebView no muestra el diálogo de permiso y la posición daba "denegada".
   *  En navegador se usa navigator.geolocation con el mismo resultado. */
  async pedirMiUbicacion(): Promise<void> {
    if (this.posicionUsuario()) {
      if (this.radioEsMaximo()) {
        this.limpiarUbicacion();
        return;
      }
      const i = this.radiosDisponibles.indexOf(this.radioKm() as never);
      const siguiente = this.radiosDisponibles[
        Math.min(i + 1, this.radiosDisponibles.length - 1)
      ];
      this.radioKm.set(siguiente);
      this.actualizarRadioCirculo();
      return;
    }
    this.ubicacionEstado.set('cargando');
    let coords: { latitude: number; longitude: number } | null = null;
    let fallo: 'denegado' | 'indisponible' | 'tiempo_agotado' = 'indisponible';
    try {
      // En APK el plugin pide el permiso nativo (diálogo del sistema); en
      // web nativoPlugins es false y cae a la API del navegador.
      if (Capacitor.isNativePlatform()) {
        const perm = await Geolocation.checkPermissions();
        if (perm.location === 'denied' || perm.coarseLocation === 'denied') {
          const pedida = await Geolocation.requestPermissions();
          if (pedida.location !== 'granted' && pedida.coarseLocation !== 'granted') {
            fallo = 'denegado';
            throw new Error('permiso-negado');
          }
        }
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: false,
          timeout: 15000
        });
        coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      } else if (typeof navigator !== 'undefined' && navigator.geolocation) {
        coords = await new Promise<{ latitude: number; longitude: number }>(
          (resolver, rechazar) => {
            navigator.geolocation.getCurrentPosition(
              (p) => resolver({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
              (err) => {
                if (err.code === GeolocationPositionError.PERMISSION_DENIED) {
                  fallo = 'denegado';
                } else if (err.code === GeolocationPositionError.POSITION_UNAVAILABLE) {
                  fallo = 'indisponible';
                } else {
                  fallo = 'tiempo_agotado';
                }
                rechazar(err);
              },
              { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 }
            );
          }
        );
      } else {
        fallo = 'indisponible';
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (fallo !== 'denegado' && msg !== 'permiso-negado') {
        // Problemas del GPS mismo (timeout / sin señal): distinguibles en UI.
        this.zona.run(() =>
          this.ubicacionEstado.set(
            msg === 'permiso-negado' ? 'denegada' : 'indisponible'
          )
        );
        return;
      }
    }
    if (!coords) {
      this.zona.run(() => this.ubicacionEstado.set(fallo === 'denegado' ? 'denegada' : 'indisponible'));
      return;
    }
    this.zona.run(() => {
      const { latitude, longitude } = coords!;
      this.posicionUsuario.set({ lat: latitude, lng: longitude });
      this.radioKm.set(this.radiosDisponibles[0]);
      this.mapa?.setView([latitude, longitude], 11);
      this.dibujarUsuario(latitude, longitude);
      this.ubicacionEstado.set('lista');
    });
  }

  private actualizarRadioCirculo(): void {
    if (this.circuloUsuario) {
      this.circuloUsuario.setRadius(this.radioKm() * 1000);
      // Reencuadra al nuevo radio (antes el círculo crecía fuera de vista).
      try {
        this.mapa?.fitBounds(this.circuloUsuario.getBounds(), { padding: [32, 32] });
      } catch {
        /* mapa aún sin tamaño: el siguiente moveend lo corrige */
      }
    }
  }

  /** Quita el filtro por ubicación (marca, círculo y radio inicial). */
  limpiarUbicacion(): void {
    this.zona.runOutsideAngular(() => {
      this.marcadorUsuario?.remove();
      this.marcadorUsuario = null;
      this.circuloUsuario?.remove();
      this.circuloUsuario = null;
    });
    this.posicionUsuario.set(null);
    this.radioKm.set(this.radiosDisponibles[0]);
    this.ubicacionEstado.set('inactiva');
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
    const firma = this.eventosEnRadio();
    const estado = this.avanceLista();
    return estado && estado.firma === firma ? estado.pagina : 1;
  });

  readonly eventosLista = computed(() =>
    this.eventosEnRadio().slice(0, this.paginaLista() * this.tamanoLista)
  );

  readonly hayMasLista = computed(
    () => this.eventosLista().length < this.eventosEnRadio().length
  );

  verMasLista(): void {
    this.avanceLista.set({
      firma: this.eventosEnRadio(),
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
    // Solo lo visible y topado: mover el mapa ya no reconstruye cientos de pines.
    const lista = this.pinesEnVista();
    if (this.mapa) {
      this.dibujarPines(lista);
    }
  });

  /**
   * Respaldo de ubicación: para cada evento filtrado sin coordenadas, pide
   * al geocodificador (Nominatim, 1 consulta/seg, deduplicada por recinto,
   * con caché persistente). Al llegar cada resultado, geoVersion refresca
   * los pines sin reconstruir nada más.
   */
  private readonly encolarGeocodificacion = effect(() => {
    this.eventosFiltrados();
    this.geoVersion();
    for (const ev of this.eventosFiltrados()) {
      if (!ev.coordenadas) void this.geocodificacion.coordenadaDe(ev);
    }
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
    this.limpiarUbicacion();
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
