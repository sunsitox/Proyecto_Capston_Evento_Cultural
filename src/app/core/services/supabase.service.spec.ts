import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

// createClient se mockea para poder inspeccionar lo que se envía a GoTrue sin
// tocar la red. Los espías viven en `vi.hoisted` porque `vi.mock` se eleva
// por encima de los imports.
const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  from: vi.fn(),
  insert: vi.fn()
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
      signUp: mocks.signUp,
      signInWithPassword: mocks.signInWithPassword,
      updateUser: mocks.updateUser
    },
    from: mocks.from
  })
}));

import { SupabaseService } from './supabase.service';

/**
 * Instancia el servicio dentro del contexto de inyección de Angular: el
 * constructor usa `inject()` (Router), que falla fuera de TestBed.
 */
function crearServicio(): SupabaseService {
  TestBed.configureTestingModule({
    providers: [{ provide: Router, useValue: { navigateByUrl: vi.fn() } }]
  });
  return TestBed.inject(SupabaseService);
}

/** Usuario crudo de GoTrue, tal como lo recibe `aSesion`. */
function usuarioCrudo(rol: 'usuario' | 'organizador') {
  return {
    id: 'u-1',
    email: 'persona@demo.cl',
    user_metadata: { nombre: 'Persona Demo', rol }
  };
}

const borrador = {
  title: 'Feria de prueba',
  description: 'Una descripción suficientemente larga para el borrador.',
  start_at: '2026-11-01T12:00:00',
  end_at: null,
  address: 'Plaza de Armas',
  venue: 'Plaza de Armas',
  is_free: true,
  price_text: null,
  image_url: '',
  audience: 'Todo público',
  categories: ['Música']
};

describe('SupabaseService · rol de la cuenta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
    mocks.insert.mockResolvedValue({ error: null });
    // registrar() habla con la Edge Function registrar-cuenta vía fetch
    // global: cada prueba define su respuesta con esta función de ayuda.
    vi.unstubAllGlobals();
  });

  it('registrar con la función desplegada abre la sesión directamente (sin signUp legacy)', async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ mensaje: 'Cuenta creada.' }), { status: 201 })
    );
    vi.stubGlobal('fetch', fetchStub);
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: usuarioCrudo('organizador') },
      error: null
    });
    const servicio = crearServicio();

    const usuario = await servicio.registrar('org@demo.cl', 'Secreta1!', 'Org Demo', 'organizador');

    // La función recibe el rol y el nombre en el cuerpo.
    expect(fetchStub).toHaveBeenCalledTimes(1);
    const cuerpo = JSON.parse(fetchStub.mock.calls[0][1].body);
    expect(cuerpo).toMatchObject({ email: 'org@demo.cl', nombre: 'Org Demo', esOrganizador: true });
    // La sesión se abre con la contraseña, no con signUp.
    expect(mocks.signInWithPassword).toHaveBeenCalledTimes(1);
    expect(mocks.signUp).not.toHaveBeenCalled();
    expect(usuario.rol).toBe('organizador');
  });

  it('sin rol explícito la cuenta nace como usuario (esOrganizador: false a la función)', async () => {
    const fetchStub = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ mensaje: 'Cuenta creada.' }), { status: 201 })
    );
    vi.stubGlobal('fetch', fetchStub);
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: usuarioCrudo('usuario') },
      error: null
    });
    const servicio = crearServicio();

    const usuario = await servicio.registrar('persona@demo.cl', 'Secreta1!', 'Persona Demo');

    const cuerpo = JSON.parse(fetchStub.mock.calls[0][1].body);
    expect(cuerpo.esOrganizador).toBe(false);
    expect(usuario.rol).toBe('usuario');
  });

  it('función no desplegada (404): respaldo legacy signUp con rol y nombre en el metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 }))
    );
    // El respaldo legacy consulta la sesión tras el signUp para devolver la
    // cuenta creada.
    mocks.getSession.mockResolvedValue({
      data: { session: { user: usuarioCrudo('usuario') } }
    });
    mocks.signUp.mockResolvedValue({ error: null });
    const servicio = crearServicio();

    await servicio.registrar('persona@demo.cl', 'Secreta1!', 'Persona Demo');

    expect(mocks.signUp).toHaveBeenCalledTimes(1);
    const args = mocks.signUp.mock.calls[0][0] as {
      options: { data: { rol: string; nombre: string } };
    };
    expect(args.options.data).toMatchObject({ rol: 'usuario', nombre: 'Persona Demo' });
  });

  it('correo ya registrado (409 de la función) lanza el mensaje claro de la UI', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Este correo ya está registrado. Inicia sesión.' }), {
          status: 409
        })
      )
    );
    const servicio = crearServicio();

    await expect(
      servicio.registrar('persona@demo.cl', 'Secreta1!', 'Persona Demo')
    ).rejects.toThrow(/ya está registrado/);
    expect(mocks.signUp).not.toHaveBeenCalled();
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it('convertirEnOrganizador actualiza la cuenta y la sesión reactiva', async () => {
    mocks.updateUser.mockResolvedValue({ data: { user: usuarioCrudo('organizador') }, error: null });
    const servicio = crearServicio();

    expect(servicio.esOrganizador()).toBe(false);
    const usuario = await servicio.convertirEnOrganizador();

    expect(usuario.rol).toBe('organizador');
    expect(servicio.esOrganizador()).toBe(true);
  });

  it('una cuenta de usuario no puede publicar (no llega al INSERT)', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: usuarioCrudo('usuario') } } });
    const servicio = crearServicio();

    await expect(servicio.publicarEvento(borrador)).rejects.toThrow(/organizador/i);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
