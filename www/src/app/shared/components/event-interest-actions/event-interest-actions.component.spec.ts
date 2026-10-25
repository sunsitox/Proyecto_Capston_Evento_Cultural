import { TestBed } from '@angular/core/testing';
import { EventInterestActionsComponent } from './event-interest-actions.component';
import { SupabaseService } from '../../../core/services/supabase.service';
import { SolicitaSesionService } from '../../../core/services/solicita-sesion.service';

/**
 * El gate de sesión en "Me interesa": sin cuenta el aviso se presenta y la
 * señal no se registra; con sesión el toggle emite como siempre.
 */
describe('EventInterestActionsComponent — gate de sesión para "Me interesa"', () => {
  /** Evento DOM mínimo (sólo se usan preventDefault/stopPropagation). */
  function clic(): Event {
    const e = new Event('click');
    e.preventDefault = () => undefined;
    e.stopPropagation = () => undefined;
    return e;
  }

  function preparar(autenticado: boolean, activo = false) {
    const aviso = { llamado: 0 };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SupabaseService,
          useValue: { estaAutenticado: () => autenticado }
        },
        {
          provide: SolicitaSesionService,
          useValue: {
            avisoParaGuardarInteres: () => {
              aviso.llamado++;
              return Promise.resolve();
            }
          }
        }
      ]
    });
    const fixture = TestBed.createComponent(EventInterestActionsComponent);
    const ref = fixture.componentRef;
    ref.setInput('titulo', 'Evento de prueba');
    ref.setInput('eventoId', activo ? 'evento-2' : 'evento-1');
    ref.setInput('activo', activo);
    return { component: fixture.componentInstance, aviso };
  }

  it('invitado: muestra el aviso y no registra la señal', async () => {
    const { component, aviso } = preparar(false);

    const recibidas: { eventoId: string; activo: boolean }[] = [];
    component.meInteresaCambiado.subscribe((c) => recibidas.push(c));

    component.toggleMeInteresa(clic());
    await Promise.resolve();

    expect(aviso.llamado).toBe(1);
    expect(recibidas).toEqual([]);
  });

  it('usuario con sesión: emite el cambio y no muestra aviso', () => {
    const { component, aviso } = preparar(true);

    const recibidas: { eventoId: string; activo: boolean }[] = [];
    component.meInteresaCambiado.subscribe((c) => recibidas.push(c));

    component.toggleMeInteresa(clic());

    expect(aviso.llamado).toBe(0);
    expect(recibidas).toEqual([{ eventoId: 'evento-1', activo: true }]);
  });

  it('botón ya activo: sí permite apagar aunque la sesión se haya perdido', () => {
    // El gate exige !activo(): apagar pasa directo al emit sin aviso.
    const { component, aviso } = preparar(false, true);

    const recibidas: { eventoId: string; activo: boolean }[] = [];
    component.meInteresaCambiado.subscribe((c) => recibidas.push(c));

    component.toggleMeInteresa(clic());

    expect(recibidas).toEqual([{ eventoId: 'evento-2', activo: false }]);
    expect(aviso.llamado).toBe(0);
  });
});
