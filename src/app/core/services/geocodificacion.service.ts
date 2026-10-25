import { Injectable, NgZone, inject } from '@angular/core';
import { Coordenadas, Evento } from '../models/evento.model';

/**
 * Geocodificación de respaldo con Nominatim (OpenStreetMap) + caché en
 * localStorage, deduplicada por consulta.
 *
 * Contexto: el catálogo de Supabase trae ~735 eventos sin latitude/longitude
 * (solo 472 de 1.207 con coordenadas). Esos eventos ya pueden verse por
 * texto en el mapa embebido, pero no aparecen como pines y «Cómo llegar»
 * era impreciso. Este servicio coordina (lat/lng) a partir de la dirección,
 * recinto, comuna y región del evento.
 *
 * - Caché persistente por consulta normalizada (los eventos suelen compartir
 *   recinto: pocos pedidos atienden a muchos eventos).
 * - Cola con un pedido por segundo (política de uso de Nominatim).
 * - Guion de respaldo: si Nominatim falla o no resuelve, devuelve null y no
 *   se reintenta la misma consulta en la sesión.
 */
@Injectable({ providedIn: 'root' })
export class GeocodificacionService {
  private readonly zona = inject(NgZone);

  private static readonly CLAVE_CACHE = 'ec-geocodificacion-v1';
  private static readonly URL_NOMINATIM =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=cl&q=';
  /** Entre pedidos consecutivos a Nominatim (ms). */
  private static readonly INTERVALO_MS = 1_100;
  /** Consultas nuevas por sesión (techo de cortesía para no saturar). */
  private static readonly TECHO_SESION = 150;

  private cache: Record<string, { lat: number; lng: number } | 'nada'> = {};
  private cola: string[] = [];
  private enMarcha = false;
  private moduloConsultas = 0;
  private sinResolverEnSesion = new Set<string>();
  private resolvedores = new Map<
    string,
    { resolver: (c: Coordenadas | null) => void; temporizador: ReturnType<typeof setTimeout> }
  >();
  /** Se emite con cada coordenada nueva: los computed se refrescan solos. */
  private notificarSobreResultado: (() => void)[] = [];

  constructor() {
    try {
      const bruto = localStorage.getItem(GeocodificacionService.CLAVE_CACHE);
      if (bruto) this.cache = JSON.parse(bruto) as typeof this.cache;
    } catch {
      /* caché corrupta: se parte de cero */
    }
  }

  /** Coordenada ya disponible (del evento, de la caché o «probada y vacía»). */
  yaResuelta(evento: Evento): Coordenadas | null | undefined {
    if (evento.coordenadas) return evento.coordenadas;
    const consulta = this.consultaDe(evento);
    const hit = this.cache[consulta];
    if (hit === 'nada') return null;
    if (hit) return { lat: hit.lat, lng: hit.lng };
    return undefined; // aún no probada
  }

  /**
   * Devuelve la coordenada cuando la tenga. Encola la consulta si es nueva
   * (max 1 pedido/seg ilimitado por consulta única, sin repetir fallos).
   */
  async coordenadaDe(evento: Evento): Promise<Coordenadas | null | undefined> {
    const directo = this.yaResuelta(evento);
    if (directo !== undefined) return directo;

    const consulta = this.consultaDe(evento);
    if (this.moduloConsultas >= GeocodificacionService.TECHO_SESION) {
      return undefined; // techo de cortesía: sin red de respaldo por ahora
    }
    if (this.sinResolverEnSesion.has(consulta)) return undefined;

    return new Promise<Coordenadas | null | undefined>((resolver) => {
      const registro = this.resolvedores.get(consulta);
      if (!registro) {
        this.resolvedores.set(consulta, { resolver, temporizador: setTimeout(() => resolver(undefined), 30_000) });
      }
      if (!this.cola.includes(consulta)) {
        this.cola.push(consulta);
        void this.procesarCola();
      }
    });
  }

  /** Callback por coordenada nueva (usado por los computed reactivos). */
  alResolver(escucha: () => void): void {
    this.notificarSobreResultado.push(escucha);
  }

  private consultaDe(evento: Evento): string {
    return [evento.direccion || evento.recinto, evento.comuna, evento.region, 'Chile']
      .filter(Boolean)
      .join(', ')
      .toLowerCase()
      .trim();
  }

  private async procesarCola(): Promise<void> {
    if (this.enMarcha) return;
    this.enMarcha = true;
    this.zona.runOutsideAngular(async () => {
      try {
        while (this.cola.length > 0) {
          const consulta = this.cola.shift()!;
          const resultado = await this.geocodificar(consulta);
          this.registrar(consulta, resultado);
          // Política de uso de Nominatim: a lo más un pedido por segundo.
          await dormir(GeocodificacionService.INTERVALO_MS);
        }
      } finally {
        this.enMarcha = false;
      }
    });
  }

  private registrar(consulta: string, resultado: Coordenadas | null): void {
    this.cache[consulta] = resultado ? { lat: resultado.lat, lng: resultado.lng } : 'nada';
    try {
      localStorage.setItem(GeocodificacionService.CLAVE_CACHE, JSON.stringify(this.cache));
    } catch {
      /* almacenamiento lleno: la caché vive sólo en la sesión */
    }
    this.zona.run(() => {
      const registro = this.resolvedores.get(consulta);
      this.resolvedores.delete(consulta);
      for (const notificar of this.notificarSobreResultado) notificar();
      if (registro) {
        clearTimeout(registro.temporizador);
        registro.resolver(resultado);
      }
    });
  }

  private async geocodificar(consulta: string): Promise<Coordenadas | null> {
    this.moduloConsultas++;
    try {
      const respuesta = await fetch(
        `${GeocodificacionService.URL_NOMINATIM}${encodeURIComponent(consulta)}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!respuesta.ok) return null;
      const filas = (await respuesta.json()) as {
        lat: string;
        lon: string;
      }[];
      const fila = filas[0];
      const lat = Number(fila?.lat);
      const lng = Number(fila?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    } catch {
      return null;
    }
  }
}

function dormir(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
