import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { Capacitor } from '@capacitor/core';
import { App, type URLOpenListenerEvent } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

/**
 * Deep link que la APK escucha para recibir el regreso del OAuth (Google):
 * el flujo se completa en el navegador del sistema y Supabase redirige aquí.
 * DEBE estar registrado en Supabase → Authentication → URL Configuration →
 * Redirect URLs, o el token caerá en el Site URL y la app no lo recibirá.
 */
const DEEP_LINK_CALLBACK = 'cl.eventocultural.app://auth/callback';

/** Usuario en sesión (contrato equivalente al del backend Python anterior). */
export interface UsuarioSesion {
  id: string;
  email: string;
  nombre?: string;
  rol: 'usuario' | 'organizador';
  /** Imagen de perfil: la que subió la persona (avatar_url_custom) o la
   *  que trae la sesión OAuth (Google escribe avatar_url). */
  avatarUrl?: string;
  /** Proveedor con el que se inició sesión: "email" o "google". */
  proveedor?: string;
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
  private readonly router = inject(Router);
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

  /** Evita procesar dos veces el mismo token si Android entega el intent duplicado. */
  private ultimoTokenProcesado = '';

  constructor() {
    void this.restaurarSesion();
    // APK: cuando el navegador externo vuelve al deep link con el token,
    // instalamos la sesión aquí (en web lo hace /auth/callback).
    if (Capacitor.isNativePlatform()) {
      void App.addListener('appUrlOpen', (evento: URLOpenListenerEvent) => {
        void this.procesarDeepLinkOAuth(evento.url);
      });
    }
  }

  readonly usuario = this._usuario.asReadonly();
  readonly estaAutenticado = computed(() => !!this._usuario());
  readonly esOrganizador = computed(() => this._usuario()?.rol === 'organizador');
  readonly sesionLista = this._sesionLista.asReadonly();

  /**
   * Datos crudos de la sesión GoTrue activa. La usa el guard del panel de
   * administración (necesita el proveedor y el token de acceso, cosas que el
   * perfil amigable de `usuario()` no expone).
   */
  async sesionGoTrue(): Promise<{
    id: string;
    email: string;
    /** identity provider de la sesión: 'email' para cuentas con contraseña. */
    proveedor: string;
    token: string;
  } | null> {
    const { data } = await this.cliente.auth.getSession();
    const user = data.session?.user;
    if (!user) return null;
    const aplico = (user.app_metadata ?? {}) as Record<string, unknown>;
    const proveedor = typeof aplico['provider'] === 'string' ? aplico['provider'] : 'email';
    return {
      id: user.id,
      email: user.email ?? '',
      proveedor,
      token: data.session?.access_token ?? ''
    };
  }

  /**
   * Rol real del usuario según la base de datos (`public.profiles.role`,
   * dominio visitor/editor/admin). El cliente autenticado sólo puede leer su
   * propia fila (RLS "Users read own profile"), así que este dato no es
   * falsificable desde el cliente. Retorna null si no hay fila o falla.
   */
  async rolDelPerfil(uid: string): Promise<string | null> {
    const { data, error } = await this.cliente
      .from('profiles')
      .select('role')
      .eq('id', uid)
      .maybeSingle();
    if (error) return null;
    return typeof data?.role === 'string' ? data.role : null;
  }

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
    app_metadata?: Record<string, unknown>;
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
    // Imagen: primero la subida manual del usuario; si no, la que traiga la
    // sesión OAuth (Google escribe avatar_url en el metadata). Un registro por
    // correo sin imagen queda sin avatar y muestra el ícono genérico.
    const avatarUrl =
      (typeof meta['avatar_url_custom'] === 'string' && meta['avatar_url_custom']) ||
      (typeof meta['avatar_url'] === 'string' && meta['avatar_url']) ||
      undefined;
    const aplico = user.app_metadata ?? {};
    const proveedor =
      typeof aplico['provider'] === 'string' ? aplico['provider'] : undefined;
    return { id: user.id, email: user.email ?? '', nombre, rol, avatarUrl, proveedor };
  }

  // ------------------------------------------------------------------
  // Autenticación por contraseña (GoTrue directo)
  // ------------------------------------------------------------------

  /**
   * Registro SIN el paso de verificación de correo:
   *
   *  1. La Edge Function `registrar-cuenta` crea el usuario YA CONFIRMADO
   *     (Admin API con email_confirm: true) y envía el correo de registro
   *     exitoso (motor Resend configurado en la función).
   *  2. Aquí se abre la sesión de inmediato con la misma contraseña.
   *
   * Si la función no está desplegada (503), cae al flujo legacy de signUp
   * (con el correo de confirmación de Supabase) para que el registro no
   * quede bloqueado: la página de login muestra el aviso de verificar buzón.
   * Devuelve la sesión abierta; si el usuario existía, lanza "Correo ya
   * registrado" (409 de la función) para que la UI lo muestre.
   */
  /** Error reservado del flujo legacy: cuenta creada, falta confirmar el buzón. */
  static readonly REGISTRO_PENDIENTE_CONFIRMACION = 'PENDIENTE_CONFIRMACION';

  async registrar(
    email: string,
    password: string,
    nombre?: string,
    rol: UsuarioSesion['rol'] = 'usuario'
  ): Promise<UsuarioSesion> {
    const nombreLimpio = (nombre ?? '').trim();

    // 1) Función registrar-cuenta: crea la cuenta YA confirmada, envía el
    //    correo de registro exitoso y devolvemos sesión abierta abajo.
    let funcionDisponible = false;
    let errorFuncion: string | null = null;
    try {
      const respuesta = await fetch(environment.registrarEdgeFunctionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          nombre: nombreLimpio,
          esOrganizador: rol === 'organizador'
        })
      });
      const cuerpo = (await respuesta.json().catch(() => null)) as { error?: string } | null;

      if (respuesta.status === 404 || respuesta.status === 503) {
        // Sin desplegar / sin secretos: usamos el respaldo legacy.
        funcionDisponible = false;
      } else if (!respuesta.ok) {
        errorFuncion = cuerpo?.error || 'No se pudo registrar la cuenta.';
      } else {
        funcionDisponible = true;
      }
    } catch {
      // Fetch no respondió (red/CDN): probamos el respaldo legacy, que con
      // Supabase directo dará el error de red real si corresponde.
      funcionDisponible = false;
    }

    if (errorFuncion) throw new Error(errorFuncion);

    // 2) Respaldo legacy (comportamiento anterior con correo de confirmación)
    //    sólo cuando la función no está activa.
    if (!funcionDisponible) {
      return this.registrarLegacy(email, password, nombreLimpio, rol);
    }

    // 3) Cuenta ya confirmada: la sesión se abre al instante.
    return this.ingresar(email, password);
  }

  /**
   * Respaldo (si registrar-cuenta aún no está desplegada): signUp normal.
   * Con "Confirm email" activo la sesión queda vacía y se lanza
   * REGISTRO_PENDIENTE_CONFIRMACION para que la UI muestre el aviso clásico.
   */
  private async registrarLegacy(
    email: string,
    password: string,
    nombreLimpio: string,
    rol: UsuarioSesion['rol']
  ): Promise<UsuarioSesion> {
    const { error } = await this.cliente.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          nombre: nombreLimpio,
          nombre_display: nombreLimpio,
          email: email.trim(),
          rol
        },
        emailRedirectTo: `${location.origin}/auth/callback`
      }
    });
    if (error) throw error;
    const { data: sesion } = await this.cliente.auth.getSession();
    if (sesion.session?.user) {
      const usuario = this.aSesion(sesion.session.user);
      this._usuario.set(usuario);
      return usuario;
    }
    throw new Error(SupabaseService.REGISTRO_PENDIENTE_CONFIRMACION);
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
    if (Capacitor.isNativePlatform()) {
      // APK: pedimos la URL de autorización SIN navegar (el WebView de la app
      // no puede ejecutar el login de Google), la abrimos en el navegador del
      // sistema (Custom Tabs) y el regreso llega por el deep link.
      const { data, error } = await this.cliente.auth.signInWithOAuth({
        provider: proveedor,
        options: { redirectTo: DEEP_LINK_CALLBACK, skipBrowserRedirect: true }
      });
      if (error) throw error;
      if (!data.url) throw new Error('No se pudo iniciar el flujo con el proveedor.');
      await Browser.open({ url: data.url });
      return;
    }
    const { error } = await this.cliente.auth.signInWithOAuth({
      provider: proveedor,
      options: { redirectTo: `${location.origin}/auth/callback` }
    });
    if (error) throw error;
  }

  /**
   * APK: procesa el deep link cl.eventocultural.app://auth/callback#access_token=...
   * instalando la sesión y cerrando el navegador externo. Se ignora si la URL no
   * es el callback, si no trae token o si Android entega el intent duplicado.
   */
  private async procesarDeepLinkOAuth(url: string): Promise<void> {
    if (!url.startsWith(DEEP_LINK_CALLBACK)) return;
    const cuerpo = url.slice(DEEP_LINK_CALLBACK.length);
    const parametros = new URLSearchParams(cuerpo.startsWith('#') ? cuerpo.slice(1) : cuerpo);
    const accessToken = parametros.get('access_token') ?? '';
    const refreshToken = parametros.get('refresh_token') ?? '';
    if (!accessToken || accessToken === this.ultimoTokenProcesado) return;
    this.ultimoTokenProcesado = accessToken;
    void Browser.close().catch(() => undefined);
    try {
      const { error } = await this.cliente.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      if (error) throw error;
      // onAuthStateChange ya actualiza el usuario; solo falta saltar a /home.
      void this.router.navigate(['/home']);
    } catch (error) {
      console.error('OAuth: no se pudo instalar la sesión del deep link', error);
    }
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
   * Guarda los datos editables del perfil: el nombre visible.
   * Escribe el mismo valor en las tres claves del metadata (`nombre`,
   * `nombre_display` y `full_name`) para que el cambio se vea aunque el
   * perfil venga de OAuth (que consulta `full_name` primero).
   */
  async actualizarPerfilDatos(nombre: string): Promise<UsuarioSesion> {
    const nombreLimpio = nombre.trim().slice(0, 80);
    if (!nombreLimpio) throw new Error('El nombre no puede quedar vacío.');
    const { data, error } = await this.cliente.auth.updateUser({
      data: {
        nombre: nombreLimpio,
        nombre_display: nombreLimpio,
        full_name: nombreLimpio
      }
    });
    if (error) throw error;
    if (!data.user) throw new Error('No se pudo actualizar el perfil.');
    const usuario = this.aSesion(data.user);
    this._usuario.set(usuario);
    return usuario;
  }

  /**
   * Sube la imagen de avatar a Storage (bucket `avatars`, ruta del propio
   * usuario) y la fija en el metadata como `avatar_url_custom`, que en
   * `aSesion` tiene precedencia sobre la imagen de la sesión OAuth.
   * El bucket y sus políticas se crean con la migración de avatars.
   */
  async subirAvatar(archivo: Blob, nombreArchivo: string): Promise<UsuarioSesion> {
    const usuario = this._usuario();
    if (!usuario) throw new Error('Necesitas sesión para cambiar tu imagen.');
    const ruta = `${usuario.id}/avatar-${Date.now()}-${nombreArchivo.replace(/[^\w.-]/g, '_')}`;
    const { error: errorSubida } = await this.cliente.storage
      .from('avatars')
      .upload(ruta, archivo, {
        upsert: true,
        contentType: archivo.type || 'image/jpeg'
      });
    if (errorSubida) throw errorSubida;
    const { data: publica } = this.cliente.storage.from('avatars').getPublicUrl(ruta);
    const url = publica?.publicUrl;
    if (!url) throw new Error('No se pudo resolver la URL pública de la imagen.');
    const { data, error } = await this.cliente.auth.updateUser({
      data: { avatar_url_custom: url }
    });
    if (error) throw error;
    if (data.user) {
      const actualizado = this.aSesion(data.user);
      this._usuario.set(actualizado);
      return actualizado;
    }
    throw new Error('No se pudo actualizar el perfil.');
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
   * Obtiene los eventos publicados POR LOTES (progressive loading) y las
   * comunas + categorías. Cada lote (~150 filas) llega en una petición
   * propia; alLote() se invoca al recibirlo para que la interfaz pinte
   * progresivamente sin esperar el catálogo completo.
   */
  async catalogo(
    alLote?: (lote: (EventoRaw & { categorias: string[] })[]) => void,
    // Entrega el mapa de comunas en cuanto se carga (antes del primer lote):
    // el callback de lotes lo necesita ya poblado, no puede leer la variable
    // del return (aún no existe cuando corre).
    onComunas?: (comunas: Map<string, CommuneRaw>) => void
  ): Promise<{
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
      onComunas?.(comunas);
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

    // --- eventos publicados, por lotes en paralelo (O2 de la auditoría) ---
    // Descargar los ~7 bloques en serie era la parte más lenta del arranque.
    // El orden final lo reconstruye el llamador (`_eventos.set(acumulados)`),
    // así que las peticiones pueden ir simultáneas: se lanzan de a 3 y se
    // avanza hasta que un lote llega incompleto. Cada lote que llega sigue
    // invocando `alLote` (el pintado progresivo no cambia).
    const eventos: (EventoRaw & { categorias: string[] })[] = [];
    const TAM = 150;
    const PARALELO = 3;
    let offset = 0;
    let agotado = false;
    while (!agotado) {
      const offsets: number[] = [];
      for (let i = 0; i < PARALELO; i++) {
        if (agotado) break;
        offsets.push(offset);
        offset += TAM;
      }
      const resultados = await Promise.all(
        offsets.map(async (desde) => {
          const { data, error } = await this.cliente
            .from('events')
            .select('*')
            .eq('status', 'published')
            .eq('is_suppressed', false)
            .order('start_at', { ascending: true })
            .range(desde, desde + TAM - 1);
          return { desde, filas: error ? [] : ((data ?? []) as EventoRaw[]) };
        })
      );
      for (const { filas } of resultados) {
        if (filas.length < TAM) agotado = true;
        if (filas.length === 0) continue;
        const lote = filas.map((fila) => ({
          ...fila,
          categorias: categoriasPorEvento.get(fila.id) ?? []
        }));
        eventos.push(...lote);
        try {
          alLote?.(lote);
        } catch {
          /* un callback que falla no corta el resto del catálogo */
        }
      }
    }

    return { eventos, comunas, total: eventos.length };
  }

  /**
   * Publicación de eventos vía Edge Function `publicar-evento`.
   *
   * Antes era un INSERT cliente con el JWT (RLS), pero nunca iba a funcionar:
   * `events` exige `external_key` NOT NULL + único y `source_id` NOT NULL
   * (FK a `sources`), y el constraint de `status` no admite 'pending_review'.
   * La función (supabase/functions/publicar-evento) hace el INSERT con
   * service_role generando esos campos, revalida el JWT con Admin API y
   * rechaza cuentas sin rol organizador.
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
    comuna?: string;
    modalidad?: string;
    official_url?: string;
    categories: (string | null)[];
  }): Promise<void> {
    const { data: sesion } = await this.cliente.auth.getSession();
    if (!sesion.session?.user) {
      throw new Error('Se requiere sesión de organizador para publicar.');
    }
    // Defensa en profundidad (y compat con la spec): la UI ya oculta el
    // formulario a cuentas de usuario, pero la llamada tampoco debe salir
    // desde una cuenta ciudadana.
    if (this.aSesion(sesion.session.user).rol !== 'organizador') {
      throw new Error(
        'Tu cuenta es de usuario. Activa el perfil de organizador para publicar eventos.'
      );
    }

    const respuesta = await fetch(environment.publicarEdgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sesion.session.access_token}`
      },
      body: JSON.stringify({
        titulo: draft.title,
        descripcion: draft.description,
        start_at: draft.start_at,
        end_at: draft.end_at,
        venue: draft.venue,
        address: draft.address,
        comuna: draft.comuna ?? null,
        modalidad: draft.modalidad ?? null,
        is_free: draft.is_free,
        price_text: draft.price_text,
        image_url: draft.image_url,
        official_url: draft.official_url ?? null,
        audience: draft.audience,
        categories: draft.categories
      })
    });
    const datos = (await respuesta.json().catch(() => null)) as
      | { error?: string; mensaje?: string }
      | null;
    if (!respuesta.ok || !datos) {
      throw new Error(datos?.error || 'No se pudo guardar el evento. Intenta de nuevo.');
    }
  }
}
