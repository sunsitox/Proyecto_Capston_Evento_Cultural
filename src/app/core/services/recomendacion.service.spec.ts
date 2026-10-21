import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Evento } from '../models/evento.model';
import {
  PREFERENCIAS_INICIALES,
  RecommendationSignal,
  SignalKind,
  UserPreferences
} from '../models/recomendacion.model';
import { PersistenciaRecomendaciones } from './recomendacion-persistencia';
import { RecomendacionService } from './recomendacion.service';

/** Doble de la persistencia en la cuenta, para probar el cableado. */
class PersistenciaFalsa extends PersistenciaRecomendaciones {
  readonly usuarioId = signal<string | null>('usuario-1');
  senalesEnCuenta: RecommendationSignal[] = [];
  preferenciasEnCuenta: UserPreferences | null = null;
  readonly guardadas: { kind: SignalKind; eventId: string }[] = [];
  readonly borradas: { kind: SignalKind; eventId: string }[] = [];
  limpiezas = 0;

  cargarSenales(): Promise<RecommendationSignal[]> {
    return Promise.resolve(this.senalesEnCuenta);
  }
  guardarSenal(kind: SignalKind, eventId: string): Promise<void> {
    this.guardadas.push({ kind, eventId });
    return Promise.resolve();
  }
  borrarSenal(kind: SignalKind, eventId: string): Promise<void> {
    this.borradas.push({ kind, eventId });
    return Promise.resolve();
  }
  limpiarSenales(): Promise<void> {
    this.limpiezas++;
    return Promise.resolve();
  }
  cargarPreferencias(): Promise<UserPreferences | null> {
    return Promise.resolve(this.preferenciasEnCuenta);
  }
  guardarPreferencias(prefs: UserPreferences): Promise<void> {
    this.preferenciasEnCuenta = prefs;
    return Promise.resolve();
  }
}

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

  it('los espacios permanentes quedan vigentes aunque no tengan fecha', () => {
    const museo = evento({
      id: 'museo',
      fecha: '',
      hora: '',
      permanente: true
    });

    const recomendaciones = servicio.recomendar([museo], { fechaRef: REF });

    expect(recomendaciones.map((r) => r.evento.id)).toEqual(['museo']);
  });

  it('los permanentes van después de los eventos con fecha concreta', () => {
    const agenda = evento({ id: 'agenda' });
    const museo = evento({ id: 'museo', fecha: '', permanente: true });

    const recomendaciones = servicio.recomendar([museo, agenda], { fechaRef: REF });

    expect(recomendaciones[0].evento.id).toBe('agenda');
    expect(recomendaciones[1].evento.id).toBe('museo');
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

  describe('persistencia en la cuenta', () => {
    let servicioConCuenta: RecomendacionService;
    let cuenta: PersistenciaFalsa;

    beforeEach(() => {
      cuenta = new PersistenciaFalsa();
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: PersistenciaRecomendaciones, useValue: cuenta }
        ]
      });
      servicioConCuenta = TestBed.inject(RecomendacionService);
    });

    it('guarda cada señal en la cuenta', () => {
      servicioConCuenta.alternarMeInteresa('evento-1', true);
      servicioConCuenta.registrarSenal('no_me_interesa', 'evento-2');

      expect(cuenta.guardadas).toEqual([
        { kind: 'me_interesa', eventId: 'evento-1' },
        { kind: 'no_me_interesa', eventId: 'evento-2' }
      ]);
    });

    it('borra la señal guardada al desmarcar "Me interesa"', () => {
      servicioConCuenta.alternarMeInteresa('evento-1', true);
      servicioConCuenta.alternarMeInteresa('evento-1', false);

      expect(cuenta.borradas).toEqual([
        { kind: 'me_interesa', eventId: 'evento-1' }
      ]);
      expect(servicioConCuenta.totalSenales()).toBe(0);
    });

    it('guarda las preferencias declaradas', () => {
      servicioConCuenta.guardarPreferencias({ categorias: ['Música'] });

      expect(cuenta.preferenciasEnCuenta?.categorias).toEqual(['Música']);
      expect(cuenta.preferenciasEnCuenta?.alcance).toBe(
        PREFERENCIAS_INICIALES.alcance
      );
    });

    it('reiniciar intereses limpia también el historial de la cuenta', () => {
      servicioConCuenta.registrarSenal('me_interesa', 'evento-1');
      servicioConCuenta.reiniciarVisita();

      expect(cuenta.limpiezas).toBe(1);
      expect(servicioConCuenta.totalSenales()).toBe(0);
    });

    it('no arrastra intereses al cambiar de cuenta', async () => {
      cuenta.senalesEnCuenta = [
        { kind: 'me_interesa', eventId: 'evento-1', at: '2030-01-01T10:00:00Z' }
      ];
      await vi.waitFor(() =>
        expect(servicioConCuenta.totalSenales()).toBe(1)
      );

      // Otra persona entra en el mismo navegador: su historial manda.
      cuenta.senalesEnCuenta = [];
      cuenta.usuarioId.set('usuario-2');

      await vi.waitFor(() => expect(servicioConCuenta.totalSenales()).toBe(0));
    });

    it('recupera el historial de la cuenta al iniciar sesión', async () => {
      cuenta.senalesEnCuenta = [
        { kind: 'me_interesa', eventId: 'evento-guardado', at: '2030-01-01T10:00:00Z' },
        { kind: 'no_me_interesa', eventId: 'evento-oculto', at: '2030-01-02T10:00:00Z' }
      ];
      cuenta.preferenciasEnCuenta = {
        ...PREFERENCIAS_INICIALES,
        categorias: ['Teatro']
      };

      // Un servicio nuevo hidrata al detectar la sesión.
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: PersistenciaRecomendaciones, useValue: cuenta }
        ]
      });
      const recargado = TestBed.inject(RecomendacionService);

      await vi.waitFor(() => expect(recargado.totalSenales()).toBe(2));

      const ids = recargado
        .recomendar(
          [evento({ id: 'evento-guardado' }), evento({ id: 'evento-oculto' })],
          { fechaRef: REF }
        )
        .map((r) => r.evento.id);
      expect(ids).toEqual(['evento-guardado']);
      expect(recargado.preferencias().categorias).toEqual(['Teatro']);
      expect(recargado.preferenciasConfiguradas()).toBe(true);
    });
  });
});
