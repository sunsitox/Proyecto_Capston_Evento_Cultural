import { TestBed } from '@angular/core/testing';
import { Evento } from '../models/evento.model';
import { RecomendacionService } from './recomendacion.service';

/** Fecha de referencia fija: los eventos de prueba viven en 2030. */
const REF = new Date(2030, 0, 15);

/** Evento mínimo válido para el motor (se sobrescribe lo que importa). */
function evento(over: Partial<Evento> & { id: string }): Evento {
  return {
    titulo: `Evento ${over.id}`,
    descripcion: '',
    imagen: '',
    fecha: '2030-02-01',
    hora: '20:00',
    recinto: '',
    direccion: '',
    comuna: 'Providencia',
    region: 'Metropolitana',
    modalidad: 'Presencial',
    categoria: 'Música',
    categorias: ['Música'],
    organizador: '',
    precio: '',
    gratuito: true,
    publico: 'Todo público',
    fuente: '',
    ultimaComprobacion: '2030-01-01',
    estado: 'proximo',
    ...over
  };
}

describe('RecomendacionService', () => {
  let servicio: RecomendacionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    servicio = TestBed.inject(RecomendacionService);
  });

  it('deja fuera los eventos descartados y los que ya terminaron', () => {
    servicio.registrarSenal('no_me_interesa', 'a');

    const recomendaciones = servicio.recomendar(
      [
        evento({ id: 'a' }),
        evento({ id: 'b' }),
        evento({ id: 'viejo', fecha: '2000-01-01' })
      ],
      { fechaRef: REF }
    );

    expect(recomendaciones.map((r) => r.evento.id)).toEqual(['b']);
  });

  it('ordena primero la modalidad declarada en el onboarding', () => {
    const virtual = evento({ id: 'virtual', modalidad: 'Virtual' });
    const presencial = evento({ id: 'presencial', modalidad: 'Presencial' });

    servicio.guardarPreferencias({ modalidades: ['Virtual'] });

    const recomendaciones = servicio.recomendar([presencial, virtual], { fechaRef: REF });

    expect(recomendaciones[0].evento.id).toBe('virtual');
    expect(recomendaciones[0].motivo.tipo).toBe('modalidad_preferida');
  });

  it('no penaliza el alcance cuando no hay comuna de referencia', () => {
    const maipu = evento({ id: 'maipu', comuna: 'Maipú' });
    const nunoa = evento({ id: 'nunoa', comuna: 'Ñuñoa' });

    servicio.guardarPreferencias({ alcance: 'comuna' });
    const sinReferencia = servicio.recomendar([maipu, nunoa], { fechaRef: REF });

    expect(sinReferencia[0].puntaje).toBe(sinReferencia[1].puntaje);

    servicio.guardarPreferencias({ comunas: ['Ñuñoa'] });
    const conReferencia = servicio.recomendar([maipu, nunoa], { fechaRef: REF });
    const puntajeNunoa = conReferencia.find((r) => r.evento.id === 'nunoa')!.puntaje;
    const puntajeMaipu = conReferencia.find((r) => r.evento.id === 'maipu')!.puntaje;

    expect(puntajeNunoa).toBeGreaterThan(puntajeMaipu);
  });

  it('proyecta afinidad una sola vez por evento explorado', () => {
    const visto = evento({ id: 'visto' });
    const otro = evento({ id: 'otro' });
    const catalogo = [visto, otro];
    servicio.registrarResolverEventos((id) => catalogo.find((e) => e.id === id));

    servicio.registrarSenal('ver_detalle', 'visto');
    const conUnaSenal = servicio
      .recomendar(catalogo, { fechaRef: REF })
      .find((r) => r.evento.id === 'otro')!.puntaje;

    servicio.registrarSenal('me_interesa', 'visto');
    servicio.registrarSenal('ver_ubicacion', 'visto');
    const conTresSenales = servicio
      .recomendar(catalogo, { fechaRef: REF })
      .find((r) => r.evento.id === 'otro')!.puntaje;

    expect(conTresSenales).toBe(conUnaSenal);
  });

  it('resta afinidad a las categorías que se descartaron', () => {
    const descartado = evento({ id: 'descartado' });
    const similar = evento({ id: 'similar' });
    const catalogo = [descartado, similar];
    servicio.registrarResolverEventos((id) => catalogo.find((e) => e.id === id));

    const antes = servicio
      .recomendar(catalogo, { fechaRef: REF })
      .find((r) => r.evento.id === 'similar')!.puntaje;

    servicio.registrarSenal('no_me_interesa', 'descartado');
    const despues = servicio
      .recomendar(catalogo, { fechaRef: REF })
      .find((r) => r.evento.id === 'similar')!.puntaje;

    expect(despues).toBeLessThan(antes);
  });

  it('no atribuye a "eventos revisados" una zona que sólo es preferencia', () => {
    servicio.guardarPreferencias({ regiones: ['Región de Valparaíso'] });

    const [recomendacion] = servicio.recomendar(
      [evento({ id: 'valpo', region: 'Región de Valparaíso', comuna: 'Valparaíso' })],
      { fechaRef: REF }
    );

    expect(recomendacion.motivo.tipo).toBe('tu_region');
    expect(recomendacion.motivo.etiqueta).not.toContain('revisaste');
  });

  it('explica la recomendación por la categoría explorada', () => {
    const visto = evento({ id: 'visto' });
    const otro = evento({ id: 'otro' });
    const catalogo = [visto, otro];
    servicio.registrarResolverEventos((id) => catalogo.find((e) => e.id === id));

    servicio.registrarSenal('ver_detalle', 'visto');
    const recomendacion = servicio
      .recomendar(catalogo, { fechaRef: REF })
      .find((r) => r.evento.id === 'otro')!;

    expect(recomendacion.motivo.tipo).toBe('categoria_explorada');
    expect(recomendacion.motivo.etiqueta).toContain('música');
  });
});
