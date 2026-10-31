import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { EventosService } from './eventos.service';
import { SupabaseService } from './supabase.service';

/**
 * Fila de la lista de eventos del panel (data que devuelve la Edge Function
 * admin-eventos con service_role; NO es el modelo Evento del catálogo).
 */
export interface AdminEventoFila {
  id: string;
  titulo: string;
  origen: string;
  fecha: string;
  recinto: string;
  comuna: string;
  estado: 'proximo' | 'hoy' | 'en_curso' | 'vencido';
  vigente: boolean;
  /* Visibilidad pública del evento (is_suppressed = !visible). */
  visible: boolean;
  metodo: string;
  creado: string;
  actualizado: string;
}

/** Página de datos del listado (filas + paginación). */
export interface PaginaAdminEventos {
  filas: AdminEventoFila[];
  pagina: number;
  hayMas: boolean;
}

/** Bloque de filas por página (coincide con el default de la Edge Function). */
const BLOQUE = 60;

/**
 * Catálogo para el panel, OPTIMIZADO: no baja el catálogo completo (948+
 * eventos); pide página por página a la Edge Function (60 filas por llamada,
 * búsquedas resueltas en el motor) y guarda en memoria sólo lo renderizado:
 *   - conteos globales (4 números)
 *   - filas de la pestaña activa acumuladas por "Mostrar más"
 *
 * Cambiar de pestaña o de búsqueda reinicia a la página 0. Cada llamada
 * lleva el JWT de la sesión de Supabase del admin (ver
 * supabase/functions/admin-eventos/index.ts: la función valida el token y
 * exige rol 'admin' en public.profiles, con proveedor de cuenta = email).
 */
@Injectable({ providedIn: 'root' })
export class AdminEventosService {
  /** Catálogo público: se refresca tras cada mutación del panel. */
  private readonly eventosPublico = inject(EventosService);

  /** Sesión de Supabase para el Authorization del panel. */
  private readonly supabase = inject(SupabaseService);

  /** Estado del servidor sincronizado con la última respuesta de conteos. */
  private readonly _cargando = signal(false);
  private readonly _cargandoMas = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _conteos = signal({
    total: 0,
    validados: 0,
    enValidacion: 0,
    ocultos: 0
  });

  /** Pestana activa: 'validados' | 'en_validacion'. */
  private readonly _pestana = signal<'validados' | 'en_validacion'>('validados');
  private readonly _busqueda = signal('');

  /**
   * Generación de la última orden de carga. Cada cambiarPestana/
   * aplicarBusqueda la incrementa y toda respuesta que llegue de la
   * generación anterior se descarta. Es lo que evita el solapamiento:
   * alternar de pestaña mientras una carga corre pintaba las filas del
   * grupo anterior en la vista nueva (cargador antiguo + pestaña nueva).
   */
  private generacion = 0;

  /** Filas acumuladas de la pestaña activa (sólo lo ya descargado). */
  private readonly _filas = signal<AdminEventoFila[]>([]);
  private readonly _hayMas = signal(false);
  private readonly _paginaSiguiente = signal(0);

  /**
   * Copia instantánea por pestaña (stale-while-revalidate del cliente): al
   * volver a una pestaña ya visitada se muestran de inmediato el último
   * bloque descargado y la petición revalida en segundo plano. Elimina la
   * espera percibida: la tabla ya no desaparece tras cada cambio de pestaña
   * mientras la Edge Function responde. La búsqueda no usa la cache (la
   * resuelve el motor del servidor).
   */
  private readonly cachePestanas: Partial<
    Record<
      'validados' | 'en_validacion',
      { filas: AdminEventoFila[]; hayMas: boolean; paginaSiguiente: number }
    >
  > = {};

  /** Guarda la copia instantánea de la pestaña activa (sin búsqueda). */
  private guardarPestana(
    filas: AdminEventoFila[],
    hayMas: boolean,
    paginaSiguiente: number
  ): void {
    if (this._busqueda()) return;
    const pestana = this._pestana();
    if (pestana !== 'validados' && pestana !== 'en_validacion') return;
    this.cachePestanas[pestana] = { filas: [...filas], hayMas, paginaSiguiente };
  }

  /** Restaura la copia instantánea de la pestaña activa (si existe). */
  private restablecerPestana(): boolean {
    if (this._busqueda()) return false;
    const pestana = this._pestana();
    const cache =
      pestana === 'validados' || pestana === 'en_validacion'
        ? this.cachePestanas[pestana]
        : undefined;
    if (!cache) return false;
    this._filas.set([...cache.filas]);
    this._hayMas.set(cache.hayMas);
    this._paginaSiguiente.set(cache.paginaSiguiente);
    return true;
  }

  /** Eventos en curso de cambio (para deshabilitar su switch/botón). */
  private readonly _cambiando = signal<Set<string>>(new Set());
  private readonly _masivaEnMarcha = signal(false);

  readonly cargando = this._cargando.asReadonly();
  readonly cargandoMas = this._cargandoMas.asReadonly();
  readonly error = this._error.asReadonly();
  readonly conteos = this._conteos.asReadonly();
  readonly pestana = this._pestana.asReadonly();
  readonly filas = this._filas.asReadonly();
  readonly hayMas = this._hayMas.asReadonly();
  readonly cambiando = this._cambiando.asReadonly();

  /** Carga (o recarga) desde la página 0 del estado actual. */
  async cargar(): Promise<void> {
    // Cada llamada marca una única generación vigente: si mientras una carga
    // corre cambia de pestaña/búsqueda, la respuesta previa se descarta al
    // llegar y la vista nueva nunca muestra datos del estado anterior.
    const epoch = ++this.generacion;
    // Instantánea del estado CAPTURADA antes del await: coherente con la
    // petición que se emite (pestaña + búsqueda de este momento).
    const sinBusqueda = this._busqueda() === '';

    // Con copia instantánea disponible: se pinta al instante y la petición
    // corre en segundo plano sin spinner (el viaje completo sigue pasando,
    // sólo deja de bloquear la vista).
    const restaurado = sinBusqueda && this.restablecerPestana();
    if (restaurado) {
      // Limpia un spinner de una carga anterior abortada por este cambio de
      // pestaña: su finally ya no lo va a limpiar (generación distinta).
      this._cargando.set(false);
      this._error.set(null);
    } else {
      this._cargando.set(true);
      this._error.set(null);
      this._filas.set([]);
      this._paginaSiguiente.set(0);
    }
    try {
      const respuesta = await this.llamar<PaginaResponse>('listar', {
        pestana: this._pestana(),
        busqueda: this._busqueda(),
        pagina: 0,
        limite: BLOQUE
      });
      if (epoch !== this.generacion) return; // llegó tarde: hay un estado más nuevo
      this._conteos.set(respuesta.conteos);
      this._filas.set(respuesta.filas ?? []);
      this._hayMas.set(!!respuesta.hayMas);
      this._paginaSiguiente.set(1);
      if (sinBusqueda) this.guardarPestana(respuesta.filas ?? [], !!respuesta.hayMas, 1);
    } catch (e: unknown) {
      if (epoch !== this.generacion) return;
      // Con copia visible, el fallo de la revalidación no borra la tabla:
      // el último bloque sirve para seguir trabajando.
      if (restaurado && this._filas().length > 0) return;
      const err = e as { message?: string };
      this._error.set(err.message || 'No se pudo cargar el catálogo de administración.');
    } finally {
      if (epoch === this.generacion) this._cargando.set(false);
    }
  }

  /** "Mostrar más": trae la siguiente página del mismo estado. */
  async cargarMas(): Promise<void> {
    if (this._cargando() || this._cargandoMas() || !this._hayMas()) return;
    // Generación al partir: si cambió (nueva pestaña/búsqueda), la respuesta
    // no se mezcla con la lista de otro estado.
    const epoch = this.generacion;
    this._cargandoMas.set(true);
    this._error.set(null);
    try {
      const respuesta = await this.llamar<PaginaResponse>('listar', {
        pestana: this._pestana(),
        busqueda: this._busqueda(),
        pagina: this._paginaSiguiente(),
        limite: BLOQUE
      });
      // Reemplaza conteos sólo si el servidor no los cambió en el intertanto;
      // lo barato es aceptarlos siempre (son 3 counts indexados).
      if (epoch !== this.generacion) return; // cambió el estado: descartar
      this._conteos.set(respuesta.conteos);
      this._filas.update((actuales) => [...actuales, ...(respuesta.filas ?? [])]);
      this._hayMas.set(!!respuesta.hayMas);
      this._paginaSiguiente.update((n) => n + 1);
      // Refresca la copia instantánea con el bloque extra ya incluido.
      this.guardarPestana(this._filas(), !!respuesta.hayMas, this._paginaSiguiente());
    } catch (e: unknown) {
      if (epoch !== this.generacion) return;
      const err = e as { message?: string };
      this._error.set(err.message || 'No se pudo cargar más eventos.');
    } finally {
      this._cargandoMas.set(false);
    }
  }

  /** Cambia de pestaña (reinicia a página 0 con la búsqueda vigente). */
  async cambiarPestana(p: 'validados' | 'en_validacion'): Promise<void> {
    if (p === this._pestana()) return;
    this._pestana.set(p);
    await this.cargar();
  }

  /** Aplica búsqueda del servidor (reinicia a página 0). */
  async aplicarBusqueda(texto: string): Promise<void> {
    if (texto === this._busqueda()) return;
    this._busqueda.set(texto);
    await this.cargar();
  }

  /**
   * Desactiva o activa la visibilidad pública de un evento.
   * Actualización optimista: si la función falla, se revierte y se avisa.
   */
  async definirVisibilidad(evento: AdminEventoFila, visible: boolean): Promise<void> {
    if (this._cambiando().has(evento.id)) return;
    this.marcarCambio(evento.id, true);
    const previo = evento.visible;
    evento.visible = visible;
    // Notifica el cambio mutado (misma referencia) para OnPush.
    this._filas.set([...this._filas()]);
    try {
      await this.llamar('definir_visibilidad', { evento_id: evento.id, visible });
      this.refrescarCatalogoPublico();
    } catch (e: unknown) {
      evento.visible = previo;
      this._filas.set([...this._filas()]);
      const err = e as { message?: string };
      this._error.set(err.message || 'No se pudo cambiar la visibilidad.');
    } finally {
      this.marcarCambio(evento.id, false);
    }
  }

  /**
   * Desactiva o activa la visibilidad pública de TODO un grupo de una vez:
   * 'validados', 'en_validacion' o 'todos'. Devuelve los afectados que
   * informa el servidor y recarga la vista (fresca en conteos y filas).
   */
  async visibilidadMasiva(
    grupo: 'validados' | 'en_validacion' | 'todos',
    visible: boolean
  ): Promise<number> {
    if (this._masivaEnMarcha()) return 0;
    this._masivaEnMarcha.set(true);
    this._error.set(null);
    try {
      const respuesta = await this.llamar<VisibilidadMasivaResponse>('visibilidad_masiva', {
        grupo,
        visible
      });
      // Recarga el grupo desde la página 0: los conteos y la lista quedan
      // frescos sin duplicar lógica de estados en el cliente.
      await this.cargar();
      this.refrescarCatalogoPublico();
      return respuesta.afectados ?? 0;
    } catch (e: unknown) {
      const err = e as { message?: string };
      throw new Error(err.message || 'No se pudo aplicar el cambio masivo.');
    } finally {
      this._masivaEnMarcha.set(false);
    }
  }

  /** true mientras hay un cambio masivo en curso (deshabilitar botones). */
  readonly masivaEnMarcha = this._masivaEnMarcha.asReadonly();

  /** Publica un borrador "en validación": lo saca de la bandeja actual. */
  async validar(evento: AdminEventoFila): Promise<void> {
    if (this._cambiando().has(evento.id)) return;
    this.marcarCambio(evento.id, true);
    this._error.set(null);
    try {
      await this.llamar('validar', { evento_id: evento.id });
      this.refrescarCatalogoPublico();
      this._filas.update((actuales) => actuales.filter((e) => e.id !== evento.id));
      // La fila sale también de la copia instantánea de esta pestaña.
      this.guardarPestana(this._filas(), this._hayMas(), this._paginaSiguiente());
      this._conteos.update((c) => ({
        ...c,
        enValidacion: Math.max(0, c.enValidacion - 1),
        validados: c.validados + 1
      }));
    } catch (e: unknown) {
      const err = e as { message?: string };
      this._error.set(err.message || 'No se pudo validar el evento.');
    } finally {
      this.marcarCambio(evento.id, false);
    }
  }

  // ------------------------------------------------------------------ internos

  /**
   * Sincroniza el catálogo público tras una mutación (validar, visibilidad,
   * acción másiva): el dashboard y las listas públicas deben reflejar el
   * cambio sin esperar el próximo arraque de la app.
   */
  private refrescarCatalogoPublico(): void {
    void this.eventosPublico
      .cargarEventos()
      .catch(() => /* se avisa en la señal de error del servicio público */ {});
  }

  private marcarCambio(id: string, enMarcha: boolean): void {
    const lista = new Set(this._cambiando());
    if (enMarcha) lista.add(id);
    else lista.delete(id);
    this._cambiando.set(lista);
  }

  private async llamar<T>(accion: string, extra: Record<string, unknown> = {}): Promise<T> {
    // Autorización REAL: el JWT de la sesión de Supabase del admin. La Edge
    // Function valida el token, rechaza cuentas OAuth y comprueba en la base
    // de datos que profiles.role sea 'admin' (la sesión del panel ya no es
    // demo, así que no existe la puerta ALLOW_DEMO_ADMIN).
    const sesion = await this.supabase.sesionGoTrue();
    if (!sesion || (sesion.proveedor && sesion.proveedor !== 'email')) {
      throw new Error('Necesitas una sesión de administrador para gestionar el catálogo.');
    }
    const respuesta = await fetch(environment.adminEventosEdgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sesion.token}`
      },
      body: JSON.stringify({ accion, ...extra })
    });
    const cuerpo = (await respuesta.json().catch(() => null)) as
      | (T & { error?: string })
      | null;
    if (!respuesta.ok || !cuerpo) {
      throw new Error(cuerpo?.error || 'La función de administración no respondió.');
    }
    return cuerpo;
  }
}

/** Respuesta cruda del servidor para 'visibilidad_masiva'. */
interface VisibilidadMasivaResponse {
  afectados?: number;
}

/** Respuesta cruda del servidor para 'listar'. */
interface PaginaResponse {
  conteos: { total: number; validados: number; enValidacion: number; ocultos: number };
  filas?: AdminEventoFila[];
  pagina?: number;
  hayMas?: boolean;
}
