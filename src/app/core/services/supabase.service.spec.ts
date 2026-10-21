import { beforeEach, describe, expect, it, vi } from 'vitest';

// createClient se mockea para poder inspeccionar lo que se envía a GoTrue sin
// tocar la red. Los espías viven en `vi.hoisted` porque `vi.mock` se eleva
// por encima de los imports.
const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
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
      updateUser: mocks.updateUser
    },
    from: mocks.from
  })
}));

import { SupabaseService } from './supabase.service';

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
  });

  it('persiste el rol de organizador en user_metadata al registrar', async () => {
    mocks.signUp.mockResolvedValue({ error: null });
    const servicio = new SupabaseService();

    await servicio.registrar('org@demo.cl', 'Secreta1!', 'Org Demo', 'organizador');

    expect(mocks.signUp).toHaveBeenCalledTimes(1);
    const args = mocks.signUp.mock.calls[0][0] as {
      options: { data: { rol: string; nombre: string } };
    };
    expect(args.options.data).toMatchObject({ rol: 'organizador', nombre: 'Org Demo' });
  });

  it('sin rol explícito la cuenta nace como usuario', async () => {
    mocks.signUp.mockResolvedValue({ error: null });
    const servicio = new SupabaseService();

    await servicio.registrar('persona@demo.cl', 'Secreta1!', 'Persona Demo');

    const args = mocks.signUp.mock.calls[0][0] as { options: { data: { rol: string } } };
    expect(args.options.data.rol).toBe('usuario');
  });

  it('convertirEnOrganizador actualiza la cuenta y la sesión reactiva', async () => {
    mocks.updateUser.mockResolvedValue({ data: { user: usuarioCrudo('organizador') }, error: null });
    const servicio = new SupabaseService();

    expect(servicio.esOrganizador()).toBe(false);
    const usuario = await servicio.convertirEnOrganizador();

    expect(usuario.rol).toBe('organizador');
    expect(servicio.esOrganizador()).toBe(true);
  });

  it('una cuenta de usuario no puede publicar (no llega al INSERT)', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: usuarioCrudo('usuario') } } });
    const servicio = new SupabaseService();

    await expect(servicio.publicarEvento(borrador)).rejects.toThrow(/organizador/i);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
