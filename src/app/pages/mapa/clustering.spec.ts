import { describe, expect, it } from 'vitest';
import { Evento } from '../../core/models/evento.model';
import { agruparPines } from './clustering';

function evento(id: string, lat: number, lng: number): Evento {
  return {
    id,
    titulo: `Evento ${id}`,
    descripcion: '',
    imagen: '',
    fecha: '2099-05-10',
    hora: '19:00',
    recinto: '',
    direccion: '',
    comuna: 'Providencia',
    region: 'Región Metropolitana de Santiago',
    modalidad: 'Presencial',
    categoria: 'Música',
    categorias: ['Música'],
    organizador: '',
    precio: '',
    gratuito: null,
    publico: 'Todo público',
    fuente: '',
    ultimaComprobacion: '2099-01-01',
    estado: 'proximo',
    coordenadas: { lat, lng }
  };
}

/** 100 eventos repartidos en ~2 km alrededor de Providencia. */
function cienEventos(): Evento[] {
  return Array.from({ length: 100 }, (_, i) =>
    evento(
      `evt-${i}`,
      -33.43 + (i % 10) * 0.002,
      -70.62 + Math.floor(i / 10) * 0.002
    )
  );
}

describe('agruparPines (CP-MAP-006)', () => {
  it('agrupa cien eventos de una comuna al estar alejado', () => {
    const grupos = agruparPines(cienEventos(), 10);

    // Cien pines se reducen a unos pocos grupos legibles (pueden caer en
    // celdas vecinas según el borde de la rejilla).
    expect(grupos.length).toBeLessThanOrEqual(3);
    expect(grupos.reduce((total, grupo) => total + grupo.eventos.length, 0)).toBe(100);
    expect(grupos.some((grupo) => grupo.eventos.length > 50)).toBe(true);
  });

  it('separa los grupos al acercar el mapa', () => {
    const grupos = agruparPines(cienEventos(), 16);

    expect(grupos.length).toBeGreaterThan(50);
  });

  it('nunca pierde ni duplica eventos', () => {
    const eventos = cienEventos();
    for (const zoom of [9, 11, 13, 15, 17]) {
      const grupos = agruparPines(eventos, zoom);
      const ids = grupos.flatMap((grupo) => grupo.eventos.map((e) => e.id));
      expect(new Set(ids).size).toBe(eventos.length);
      expect(ids).toHaveLength(eventos.length);
      expect(grupos.every((grupo) => grupo.eventos.length > 0)).toBe(true);
    }
  });

  it('es determinista y su identificador cambia con la membresía', () => {
    const eventos = cienEventos();
    const primera = agruparPines(eventos, 10);
    const segunda = agruparPines(eventos, 10);
    expect(segunda.map((g) => g.id)).toEqual(primera.map((g) => g.id));

    const ampliado = agruparPines(
      [...eventos, evento('nuevo', -33.43, -70.62)],
      10
    );
    expect(ampliado[0].id).not.toBe(primera[0].id);
  });

  it('ignora eventos sin coordenadas', () => {
    const sinUbicacion: Evento = { ...evento('sin', -33.4, -70.6), coordenadas: undefined };
    const grupos = agruparPines([sinUbicacion], 10);
    expect(grupos).toHaveLength(0);
  });
});
