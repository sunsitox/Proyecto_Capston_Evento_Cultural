import { Injectable, computed, inject, signal } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

/** Usuario en sesión (contrato equivalente al del backend Python anterior). */
export interface UsuarioSesion {
  id: string;
  email: string;
  nombre?: string;
  rol: 'usuario' | 'organizador';
}

/** Fila cruda de la tabla `events` (esquema del pipeline del scraper). */
export interface EventoRaw {
  id: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  start_at: string | null;
  end_at: string | null;
  venue: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  commune_id: string | null;
  audience: string | null;
  is_free: boolean | null;
  price_text: string | null;
  official_url: string | null;
  source_url: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string | null;
  is_suppressed: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  last_seen_at: string | null;
}

/** Fila de `communes`. */
export interface CommuneRaw {
  id: string;
  name: string;
  region: string | null;
}

/**
 * Backend de la aplicación en TypeScript (misma arquitectura que el frontend).
 *
 * Reemplaza a la API intermedia en Python (supabase_backend.py): ahora el
 * navegador habla directamente con Supabase vía `@supabase/supabase-js` con la
 * clave pública. Las únicas dos operaciones que exigían la clave de servicio
 * (eliminar cuenta, registro ya confirmado) se delegan a una Edge Function
 * `admin-account` desplegada en Supabase (ver `supabase/functions/`).
 */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  /**
   * Cliente único compartido (maneja refresh de tokens automáticamente).
   * Es público para que los servicios de dominio (p. ej. la persistencia de
   * recomendaciones) consulten sus tablas con la sesión del usuario; RLS
   * sigue gobernando qué puede leer y escribir cada quien.
   */
  readonly cliente: SupabaseClient = createClient(
    environment.supabaseUrl,
    environment.supabaseAnonKey,
    {
      auth: {
        // La app maneja la redirección manualmente en /auth/callback.
        detectSessionInUrl: false,
        persistSession: true,
        autoRefreshToken: true
      }
    }
  );

  // ------------------------------------------------------------------
  // Sesión reactiva (equivalente a ApiService.usuario del backend Python)
  // ------------------------------------------------------------------

  private readonly _usuario = signal<UsuarioSesion | null>(null);
  private readonly _sesionLista = signal(false);

  constructor() {
    void this.restaurarSesion();
  }

  readonly usuario = this._usuario.asReadonly();
  readonly estaAutenticado = computed(() => !!this._usuario());
  readonly esOrganizador = computed(() => this._usuario()?.rol === 'organizador');
  readonly sesionLista = this._sesionLista.asReadonly();

  private async restaurarSesion(): Promise<void> {
    try {
      const { data } = await this.cliente.auth.getSession();
      this._usuario.set(data.session?.user ? this.aSesion(data.session.user) : null);
    } finally {
      this._sesionLista.set(true);
    }
    this.cliente.auth.onAuthStateChange((_evento, sesion) => {
      this._usuario.set(sesion?.user ? this.aSesion(sesion.user) : null);
    });
  }

  /** Traduce un usuario de GoTrue al perfil mínimo de la interfaz. */
  private aSesion(user: {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  }): UsuarioSesion {
    const meta = user.user_metadata ?? {};
    // OAuth (Google) escribe `full_name`/`name` y manda; si el usuario ya
    // tenía `nombre`/`nombre_display` de un registro previo, eso es un dato
    // viejo del metadata y no debe tapar lo que viene del proveedor.
    const nombre =
      (typeof meta['full_name'] === 'string' && meta['full_name']) ||
      (typeof meta['name'] === 'string' && meta['name']) ||
      (typeof meta['nombre'] === 'string' && meta['nombre']) ||
      (typeof meta['nombre_display'] === 'string' && meta['nombre_display']) ||
      (user.email ?? '').split('@')[0];
    const rol =
      typeof meta['rol'] === 'string' && meta['rol'] === 'organizador'
        ? 'organizador'
        : 'usuario';
    return { id: user.id, email: user.email ?? '', nombre, rol };
  }

  // ------------------------------------------------------------------
  // Autenticación por contraseña (GoTrue directo)
  // ------------------------------------------------------------------

  async registrar(
    email: string,
    password: string,
    nombre?: string,
    rol: UsuarioSesion['rol'] = 'usuario'
  ): Promise<{ correoAConfirmar: boolean }> {
    const nombreLimpio = (nombre ?? '').trim();
    // `rol` viaja en user_metadata: es lo que `aSesion` lee para distinguir
    // cuentas de organizador de cuentas ciudadanas.
    const data = {
      nombre: nombreLimpio,
      nombre_display: nombreLimpio,
      email: email.trim(),
      rol
    };
    // emailRedirectTo: lleva al usuario de regreso si Supabase envía un enlace
    // de confirmación de correo (o para OAuth en "signup con enlace mágico").
    const { error } = await this.cliente.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data,
        emailRedirectTo: `${location.origin}/auth/callback`
      }
    });
    if (error) throw error;
    // Con "Confirm email" activado, Supabase manda el correo; la sesión llega
    // vacía hasta confirmar. Sin confirmación, onAuthStateChange ya setea al usuario.
    const { data: sesion } = await this.cliente.auth.getSession();
    return { correoAConfirmar: !sesion.session?.user };
  }

  /**
   * Convierte la cuenta en organizador (autoservicio desde la app).
   * Sólo cambia user_metadata: la escritura de eventos sigue gobernada por RLS.
   */
  async convertirEnOrganizador(): Promise<UsuarioSesion> {
    const { data, error } = await this.cliente.auth.updateUser({
      data: { rol: 'organizador' }
    });
    if (error) throw error;
    if (!data.user) throw new Error('No se pudo actualizar la cuenta.');
    const usuario = this.aSesion(data.user);
    this._usuario.set(usuario);
    return usuario;
  }

  async ingresar(email: string, password: string): Promise<UsuarioSesion> {
    const { data, error } = await this.cliente.auth.signInWithPassword({
      email: email.trim(),
      password
    });
    if (error) throw error;
    if (!data.user) throw new Error('Respuesta de sesión inválida');
    return this.aSesion(data.user);
  }

  /** Inicia el flujo OAuth (proveedor: google, etc.). Supabase redirige de vuelta a redirectTo. */
  async iniciarOAuth(proveedor: 'google' | 'azure' | 'github' = 'google'): Promise<void> {
    const { error } = await this.cliente.auth.signInWithOAuth({
      provider: proveedor,
      options: { redirectTo: `${location.origin}/auth/callback` }
    });
    if (error) throw error;
  }

  /**
   * Pide el enlace de recuperación de contraseña (flujo desacoplado):
   * una Edge Function FARMA PROPRIA genera un JWT temporal ("cookie" con exp
   * en base64) y una segunda lo envía por el motor de correo externo
   * (Resend HTTP API). Supabase Auth no envía nada aquí.
   * La respuesta es genérica a propósito (no revela si la cuenta existe).
   */
  async recuperarContrasena(email: string): Promise<void> {
    const respuesta = await fetch(environment.resetRequestEdgeFunctionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() })
    });
    if (!respuesta.ok) {
      const texto = await respuesta.text().catch(() => '');
      throw new Error(texto || 'No se pudo iniciar la recuperación. Intenta de nuevo.');
    }
  }

  /**
   * Confirma el cambio de contraseña con el token temporal del enlace:
   * la Edge Function revalida firma + exp + un solo uso y escribe la
   * contraseña nueva en la base de datos (Admin API). Devuelve el correo
   * para que la app inicie sesión automáticamente con la nueva clave.
   */
  async confirmarResetContrasena(token: string, password: string): Promise<{ email: string }> {
    const respuesta = await fetch(environment.resetConfirmEdgeFunctionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password })
    });
    const datos = await respuesta.json().catch(() => null) as { error?: string; email?: string } | null;
    if (!respuesta.ok || !datos) {
      throw new Error(datos?.error || 'El enlace es inválido o expiró. Solicita una nueva recuperación.');
    }
    if (!datos.email) throw new Error('Respuesta incompleta de la confirmación.');
    return { email: datos.email };
  }

  /** Cambia la contraseña del usuario en sesión (tras el enlace de recuperación). */
  async actualizarContrasena(nueva: string): Promise<void> {
    const { data, error } = await this.cliente.auth.updateUser({ password: nueva });
    if (error) throw error;
    if (data.user) this._usuario.set(this.aSesion(data.user));
  }

  /**
   * Procesa el regreso OAuth en /auth/callback: supabase-js detecta el
   * fragmento (?code para PKCE o #access_token implícito) e intercambia por
   * sesión. Devuelve el usuario, o null si no hubo sesión válida.
   */
  async procesarCallbackOAuth(): Promise<UsuarioSesion | null> {
    const tieneCodigo = location.search.includes('code=');
    const tieneFragmento = location.hash.includes('access_token');
    if (!tieneCodigo && !tieneFragmento) return null;

    // errorsurfaced por onErrorAuthEvent; aquí con catch para el caso raro.
    try {
      if (tieneCodigo) {
        const { error } = await this.cliente.auth.exchangeCodeForSession(window.location.href);
        if (error) throw error;
      } else {
        const { error } = await this.cliente.auth.setSession({
          access_token: new URLSearchParams(location.hash.slice(1)).get('access_token') ?? '',
          refresh_token: new URLSearchParams(location.hash.slice(1)).get('refresh_token') ?? ''
        });
        if (error) throw error;
      }
      const { data } = await this.cliente.auth.getSession();
      const usuario = data.session?.user ? this.aSesion(data.session.user) : null;
      // Higiene: quitar el token de la URL.
      history.replaceState(null, '', location.pathname);
      return usuario;
    } catch {
      return null;
    }
  }

  async salir(): Promise<void> {
    await this.cliente.auth.signOut();
    this._usuario.set(null);
  }

  /**
   * Elimina la cuenta del usuario en sesión, vía la Edge Function
   * `admin-account` (la clave de servicio nunca sale de Supabase).
   */
  async eliminarCuenta(): Promise<void> {
    const { data } = await this.cliente.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Se requiere sesión para eliminar la cuenta');

    const respuesta = await fetch(environment.adminEdgeFunctionUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ accion: 'eliminar_cuenta' })
    });
    if (!respuesta.ok) {
      const texto = await respuesta.text();
      let mensaje = texto;
      try {
        const cuerpo = JSON.parse(texto) as { error?: string };
        if (cuerpo.error) mensaje = cuerpo.error;
      } catch {
        /* respuesta no JSON */
      }
      throw new Error(mensaje || `Error ${respuesta.status} al eliminar la cuenta`);
    }
    await this.salir();
  }

  // ------------------------------------------------------------------
  // Catálogo (PostgREST directo, clave pública, con RLS)
  // ------------------------------------------------------------------

  /**
   * Obtiene todos los eventos publicados paginando en bloques de 1000, y las
   * comunas + categorías. Equivalente exacto al GET /api/eventos del Python.
   */
  async catalogo(): Promise<{
    eventos: (EventoRaw & { categorias: string[] })[];
    comunas: Map<string, CommuneRaw>;
    total: number;
  }> {
    // --- comunas (catálogo pequeño, una sola página) ---
    const comunas = new Map<string, CommuneRaw>();
    try {
      const { data } = await this.cliente
        .from('communes')
        .select('id,name,region');
      for (const fila of (data ?? []) as CommuneRaw[]) comunas.set(fila.id, fila);
    } catch {
      /* el catálogo sigue funcionando sin nombres de comuna */
    }

    // --- vínculos evento-categoría y nombres de categoría ---
    const categoriasPorEvento = new Map<string, string[]>();
    try {
      const [vinculos, nombres] = await Promise.all([
        this.cliente.from('event_categories').select('event_id,category_id'),
        this.cliente.from('categories').select('id,name')
      ]);
      const mapaNombres = new Map<string, string>();
      for (const c of ((nombres.data ?? []) as { id: string; name: string }[]))
        mapaNombres.set(c.id, c.name);
      for (const v of ((vinculos.data ?? []) as { event_id: string; category_id: string }[])) {
        const nombre = mapaNombres.get(v.category_id);
        if (nombre) {
          const lista = categoriasPorEvento.get(v.event_id) ?? [];
          lista.push(nombre);
          categoriasPorEvento.set(v.event_id, lista);
        }
      }
    } catch {
      /* sin categorías, la ficha muestra "Otros" */
    }

    // --- eventos publicados, paginando de a 1000 ---
    const eventos: (EventoRaw & { categorias: string[] })[] = [];
    const TAM = 1000;
    for (let offset = 0; ; offset += TAM) {
      const { data, error } = await this.cliente
        .from('events')
        .select('*')
        .eq('status', 'published')
        .eq('is_suppressed', false)
        .order('start_at', { ascending: true })
        .range(offset, offset + TAM - 1);
      if (error) break;
      const filas = (data ?? []) as EventoRaw[];
      for (const fila of filas)
        eventos.push({ ...fila, categorias: categoriasPorEvento.get(fila.id) ?? [] });
      if (filas.length < TAM) break;
    }

    return { eventos, comunas, total: eventos.length };
  }

  /**
   * INSERT de publicación con el token del usuario (RLS gobierna la escritura).
   * Si aún no existe la política INSERT, PostgREST responde 403 (code 42501)
   * y el error se propaga con su mensaje.
   */
  async publicarEvento(draft: {
    title: string;
    description: string;
    start_at: string;
    end_at: string | null;
    address: string;
    venue: string;
    is_free: boolean;
    price_text: string | null;
    image_url: string;
    audience: string;
    categories: (string | null)[];
  }): Promise<void> {
    const { data: sesion } = await this.cliente.auth.getSession();
    if (!sesion.session?.user) {
      throw new Error('Se requiere sesión de organizador para publicar.');
    }
    // Defensa en profundidad: la UI ya oculta el formulario a cuentas de
    // usuario, pero el INSERT tampoco debe salir desde una cuenta ciudadana.
    if (this.aSesion(sesion.session.user).rol !== 'organizador') {
      throw new Error(
        'Tu cuenta es de usuario. Activa el perfil de organizador para publicar eventos.'
      );
    }

    const category = draft.categories.find((c): c is string => !!c) ?? 'Otros';
    const insert = {
      title: draft.title,
      description: draft.description,
      start_at: draft.start_at,
      end_at: draft.end_at,
      address: draft.address,
      venue: draft.venue,
      is_free: draft.is_free,
      price_text: draft.price_text,
      image_url: draft.image_url,
      audience: draft.audience,
      source_url: null,
      status: 'pending_review',
      city: null as string | null,
      region: null as string | null
    };

    const { error } = await this.cliente.from('events').insert(insert);
    if (error) throw error;

    // La categoría va por la tabla N:M `event_categories` (etiqueta).
    try {
      const { data: cat } = await this.cliente
        .from('categories')
        .select('id, name')
        .eq('name', category)
        .maybeSingle();
      if (cat) {
        await this.cliente.from('event_categories').insert({
          event_id: (insert as unknown as { id?: string }).id ?? undefined,
          category_id: cat.id
        });
      }
    } catch {
      /* la categoría es opcional; el evento ya se insertó */
    }
  }
}
