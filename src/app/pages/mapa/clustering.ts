import { Evento } from '../../core/models/evento.model';

/**
 * Grupo de pines cercanos para CP-MAP-006.
 *
 * El agrupamiento es por rejilla en píxeles del mapa (Web Mercator), no por
 * distancia geográfica: a cada zoom la celda mide lo mismo en pantalla, así
 * que el grupo se separa de forma natural al acercar. No se usa plugin.
 */
export interface GrupoPines {
  /** Identificador estable mientras no cambie la membresía del grupo. */
  id: string;
  lat: number;
  lng: number;
  eventos: Evento[];
}

/** Lado de la celda de agrupación, en píxeles de pantalla. */
export const TAMANO_CELDA_PX = 56;

/** Proyección Web Mercator (la misma de los tiles de OpenStreetMap). */
function aPixeles(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const escala = 256 * 2 ** zoom;
  const x = ((lng + 180) / 360) * escala;
  const seno = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
  const y = (0.5 - Math.log((1 + seno) / (1 - seno)) / (4 * Math.PI)) * escala;
  return { x, y };
}

/** Firma corta y determinista de los ids del grupo (djb2 en base 36). */
function firma(ids: string[]): string {
  let hash = 5381;
  for (const id of ids) {
    for (let i = 0; i < id.length; i++) {
      hash = ((hash << 5) + hash + id.charCodeAt(i)) | 0;
    }
  }
  return (hash >>> 0).toString(36);
}

/**
 * Agrupa los eventos con coordenadas en celdas de `tamanoCelda` píxeles para
 * el zoom indicado. La posición del grupo es el centro de sus eventos.
 */
export function agruparPines(
  eventos: Evento[],
  zoom: number,
  tamanoCelda: number = TAMANO_CELDA_PX
): GrupoPines[] {
  interface Acumulado {
    celda: string;
    sumaLat: number;
    sumaLng: number;
    eventos: Evento[];
  }
  const celdas = new Map<string, Acumulado>();

  for (const evento of eventos) {
    const coordenadas = evento.coordenadas;
    if (!coordenadas) continue;
    const { x, y } = aPixeles(coordenadas.lat, coordenadas.lng, zoom);
    const celda = `${Math.floor(x / tamanoCelda)}:${Math.floor(y / tamanoCelda)}`;
    const acumulado = celdas.get(celda);
    if (acumulado) {
      acumulado.sumaLat += coordenadas.lat;
      acumulado.sumaLng += coordenadas.lng;
      acumulado.eventos.push(evento);
    } else {
      celdas.set(celda, {
        celda,
        sumaLat: coordenadas.lat,
        sumaLng: coordenadas.lng,
        eventos: [evento]
      });
    }
  }

  return [...celdas.values()].map(({ celda, sumaLat, sumaLng, eventos: miembros }) => ({
    id: `cluster:${celda}:${firma(miembros.map((e) => e.id).sort())}`,
    lat: sumaLat / miembros.length,
    lng: sumaLng / miembros.length,
    eventos: miembros
  }));
}
