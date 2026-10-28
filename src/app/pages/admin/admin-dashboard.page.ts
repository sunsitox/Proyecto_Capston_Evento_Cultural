import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  WritableSignal,
  effect,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import * as L from 'leaflet';
import { EventosService } from '../../core/services/eventos.service';
import { AdminSidebarComponent } from './admin-sidebar.component';
import { AdminUiService } from './admin-ui.service';
import { Evento } from '../../core/models/evento.model';

/** Conteo por etiqueta (barras de distribución). */
export interface Distribucion {
  etiqueta: string;
  cantidad: number;
}

/** Celda del mapa de calor (agrega eventos cercanos en una rejilla). */
interface CeldaCalor {
  lat: number;
  lng: number;
  cantidad: number;
}

/** Radio de la rejilla agregadora: ~1,2 km en latitud. */
const CELULAS_DEG = 0.012;

/** Paleta del calor (bajo → alto), alineada al design system (terracota). */
const PALETA_CALOR: { color: string; radio: number }[] = [
  { color: '#f6a37a', radio: 6 },
  { color: '#ef8154', radio: 9 },
  { color: '#d95f2b', radio: 12 },
  { color: '#b04a1f', radio: 15 },
  { color: '#7c301a', radio: 18 }
];

/**
 * Dashboard de datos generales para el panel de administración.
 *
 * Todo se calcula en el cliente a partir del catálogo real ya cargado por
 * EventosService (publicado y vigente). El mapa de calor agrega los pines en
 * una rejilla de ~1,2 km y tiñe cada celda según densidad de eventos.
 */
@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [DecimalPipe, DatePipe, RouterLink, AdminSidebarComponent],
  templateUrl: './admin-dashboard.page.html',
  styleUrls: ['./admin-panel.shared.scss', './admin-dashboard.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminDashboardPage implements AfterViewInit, OnDestroy {
  private readonly eventosService = inject(EventosService);
  /** Estado de interfaz compartido (drawer con el botón ☰). */
  readonly ui = inject(AdminUiService);
  private readonly zone = inject(NgZone);

  private readonly lienzo = viewChild.required<ElementRef<HTMLDivElement>>('lienzo');
  private mapa?: L.Map;
  private capa?: L.LayerGroup;
  /** Última agregación de celdas (se re-pinta cuando el mapa queda listo). */
  private ultimasCeldas: CeldaCalor[] = [];
  /** Evita lanzar cargas repetidas: solo se intenta una a la vez. */
  private cargaPendiente = false;

  /** Instante de la carga de datos (transparencia del reporte). */
  readonly generado = signal(new Date());

  readonly totalEventos = signal(0);
  readonly proximos7 = signal(0);
  readonly proximos30 = signal(0);
  readonly gratuitos = signal(0);
  readonly permanentes = signal(0);
  readonly conUbicacion = signal(0);
  readonly totalComunas = signal(0);
  readonly totalCategorias = signal(0);
  readonly maxCalor = signal(1);

  /** Paleta expuesta para la leyenda del mapa. */
  readonly paletaCalor = PALETA_CALOR;

  readonly porCategoria = signal<Distribucion[]>([]);
  readonly porModalidad = signal<Distribucion[]>([]);
  readonly porPublico = signal<Distribucion[]>([]);
  readonly porComuna = signal<Distribucion[]>([]);

  constructor() {
    // El catálogo puede ya estar cargado (navegación previa) o no (entrada
    // directa al panel): se recalcula cuando `eventosVigentes` cambia y, si
    // está vacío, se lanza UNA carga real (con respaldo en demo/mock) en vez
    // de repetirla con cada notificación del signal.
    effect(() => {
      const lista = this.eventosService.eventosVigentes();
      if (lista.length) {
        this.recargar();
      } else if (!this.cargaPendiente) {
        this.cargaPendiente = true;
        void this.eventosService.cargarEventos().then(() => {
          this.cargaPendiente = false;
          if (!this.eventosService.eventosVigentes().length) this.recargar();
        });
      }
    });
  }

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.pintarMapa();
      this.dibujarCalor(this.ultimasCeldas);
    });
  }

  ngOnDestroy(): void {
    this.mapa?.remove();
  }

  /** Porcentaje relativo para las barras de distribución (0..100). */
  pct(cantidad: number, maximo: number): number {
    return maximo > 0 ? Math.round((cantidad / maximo) * 100) : 0;
  }

  /** Máximo de una distribución (base de escala de las barras). */
  maxDe(lista: Distribucion[]): number {
    return Math.max(1, ...lista.map((d) => d.cantidad));
  }

  // -----------------------------------------------------------------------
  // Cálculo de indicadores
  // -----------------------------------------------------------------------

  private recargar(): void {
    const eventos = this.eventosService.obtenerVigentes();
    const hoy = new Date();
    const en7 = new Date(hoy.getTime() + 7 * 86400000);

    this.totalEventos.set(eventos.length);
    this.gratuitos.set(eventos.filter((e) => e.gratuito).length);
    this.permanentes.set(eventos.filter((e) => e.permanente).length);
    this.conUbicacion.set(
      eventos.filter((e) => !!e.coordenadas).length
    );
    const en30 = new Date(hoy.getTime() + 30 * 86400000);
    this.proximos7.set(
      eventos.filter(
        (e) => !e.permanente && e.fecha >= isoHoy(hoy) && e.fecha <= isoHoy(en7)
      ).length
    );
    this.proximos30.set(
      eventos.filter(
        (e) => !e.permanente && e.fecha >= isoHoy(hoy) && e.fecha <= isoHoy(en30)
      ).length
    );

    const conteos: [keyof Evento, WritableSignal<Distribucion[]>, number][] = [
      ['categoria', this.porCategoria, Infinity],
      ['modalidad', this.porModalidad, Infinity],
      ['publico', this.porPublico, 6],
      ['comuna', this.porComuna, 8]
    ];
    for (const [campo, destino, tope] of conteos) {
      destino.set(topDistribucion(eventos, campo, tope));
    }

    const categorias = new Set<string>();
    const comunas = new Set<string>();
    for (const e of eventos) {
      if (e.categoria) categorias.add(e.categoria);
      if (e.comuna) comunas.add(e.comuna);
      for (const c of e.categorias ?? []) categorias.add(c);
    }
    this.totalCategorias.set(categorias.size);
    this.totalComunas.set(comunas.size);

    const celdas = this.agregarEnRejilla(eventos);
    this.maxCalor.set(Math.max(1, ...celdas.map((c) => c.cantidad)));
    this.ultimasCeldas = celdas;

    if (this.mapa) this.dibujarCalor(celdas);
  }

  /** Agrega los eventos con coordenadas en celdas de la rejilla. */
  private agregarEnRejilla(eventos: Evento[]): CeldaCalor[] {
    const claves = new Map<string, CeldaCalor>();
    for (const e of eventos) {
      if (!e.coordenadas) continue;
      const lat = Math.round(e.coordenadas.lat / CELULAS_DEG);
      const lng = Math.round(e.coordenadas.lng / CELULAS_DEG);
      const clave = `${lat}:${lng}`;
      const actual = claves.get(clave);
      if (actual) {
        actual.cantidad += 1;
      } else {
        claves.set(clave, {
          lat: lat * CELULAS_DEG,
          lng: lng * CELULAS_DEG,
          cantidad: 1
        });
      }
    }
    return [...claves.values()];
  }

  // -----------------------------------------------------------------------
  // Mapa de calor (Leaflet, sin dependencias nuevas)
  // -----------------------------------------------------------------------

  private pintarMapa(): void {
    const el = this.lienzo().nativeElement;
    this.mapa = L.map(el, {
      center: [-33.45, -70.66], // RM por defecto; se re-centra con los datos
      zoom: 10,
      zoomControl: true,
      attributionControl: true
    });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap'
    }).addTo(this.mapa);
    this.capa = L.layerGroup().addTo(this.mapa);
  }

  /** Reescribe los círculos del calor (llamar con las celdas vigentes). */
  private dibujarCalor(celdas: CeldaCalor[]): void {
    if (!this.mapa || !this.capa || !celdas.length) return;
    this.capa.clearLayers();

    const grupo = L.featureGroup();
    for (const celda of celdas) {
      const nivel = nivelCalor(celda.cantidad, this.maxCalor());
      const estilo = PALETA_CALOR[nivel];
      L.circleMarker([celda.lat, celda.lng], {
        radius: estilo.radio,
        fillColor: estilo.color,
        fillOpacity: 0.55,
        color: '#7c301a',
        weight: 1,
        opacity: 0.6
      })
        .bindTooltip(`${celda.cantidad} evento(s) en esta zona`, { direction: 'top' })
        .addTo(this.capa);
      grupo.addLayer(L.marker([celda.lat, celda.lng], { opacity: 0 }));
    }
    this.zone.runOutsideAngular(() => {
      const limites = grupo.getBounds();
      if (limites.isValid()) {
        this.mapa?.fitBounds(limites.pad(0.35), { animate: false });
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function isoHoy(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Cuenta eventos por campo y devuelve el top ordenado. */
function topDistribucion(
  eventos: Evento[],
  campo: keyof Evento,
  limite: number
): Distribucion[] {
  const conteo = new Map<string, number>();
  for (const e of eventos) {
    const valor = e[campo];
    const etiqueta = typeof valor === 'string' && valor.trim() ? valor : 'Sin dato';
    conteo.set(etiqueta, (conteo.get(etiqueta) ?? 0) + 1);
  }
  return [...conteo.entries()]
    .map(([etiqueta, cantidad]) => ({ etiqueta, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, limite);
}

/** Escala 0..4 según densidad relativa al máximo. */
function nivelCalor(cantidad: number, maximo: number): number {
  const rel = cantidad / Math.max(1, maximo);
  return Math.min(4, Math.floor(rel * 5));
}
