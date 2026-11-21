import { ApiService } from '../../core/services/api.service';
import type { MiEventoOrganizador } from '../../core/services/supabase.service';
import { Component, effect, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  IonItem,
  IonInput,
  IonTextarea,
  IonSelect,
  IonSelectOption,
  IonButton,
  IonIcon,
  IonDatetime,
  IonDatetimeButton,
  IonModal,
  IonCheckbox,
  IonLabel,
  IonSpinner
} from '@ionic/angular';
import { EventosService } from '../../core/services/eventos.service';
import { CATEGORIAS, COMUNAS, MODALIDADES, PUBLICOS } from '../../data/mock-eventos';
import { Evento } from '../../core/models/evento.model';

type CampoPublicar =
  | 'titulo'
  | 'descripcion'
  | 'fecha'
  | 'categoria'
  | 'comuna'
  | 'direccion';

@Component({
  selector: 'app-publicar-evento',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    IonItem,
    IonInput,
    IonTextarea,
    IonSelect,
    IonSelectOption,
    IonButton,
    IonIcon,
    IonDatetime,
    IonDatetimeButton,
    IonModal,
    IonCheckbox,
    IonLabel,
    IonSpinner
  ],
  templateUrl: './publicar-evento.page.html',
  styleUrl: './publicar-evento.page.scss'
})
export class PublicarEventoPage {
  readonly categorias = signal<string[]>([...CATEGORIAS]);
  private fechasOriginales: { inicio: string; fin: string | null } | null = null;
  readonly comunas = COMUNAS;
  readonly modalidades = MODALIDADES;
  readonly publicos = PUBLICOS;
  readonly enviado = signal(false);
  readonly cargando = signal(false);
  readonly activandoOrganizador = signal(false);
  readonly errorServidor = signal<string | null>(null);
  readonly api = inject(ApiService);
  /** Eventos creados por esta cuenta (CP-F3-OWN-001). */
  readonly misEventos = signal<MiEventoOrganizador[]>([]);
  /** Id del evento en edición (null = creación). */
  readonly editandoId = signal<string | null>(null);

  private readonly fb = inject(FormBuilder);
  private readonly eventosService = inject(EventosService);
  private readonly router = inject(Router);

  readonly formulario = this.fb.group({
    titulo: ['', [Validators.required, Validators.minLength(4)]],
    descripcion: ['', [Validators.required, Validators.minLength(20)]],
    fecha: [new Date().toISOString(), Validators.required],
    fechaTermino: [''],
    hora: ['12:00'],
    horaTermino: ['12:00', Validators.required],
    modalidad: ['Presencial' as string, Validators.required],
    publico: ['Todo público'],
    categoria: [[] as string[], Validators.required],
    comuna: [null as string | null, Validators.required],
    direccion: ['', Validators.required],
    accesibilidad: [''],
    inscripcion: [''],
    precio: [''],
    imagenUrl: [''],
    enlaceInscripcion: [''],
    paginaOficial: [''],
    gratuito: [true]
  });

  constructor() {
    // Carga recientes cuando la sesión restaura el rol organizador
    // (es asíncrono: en ngOnInit aún puede ser false).
    effect(() => {
      if (this.api.sesionLista() && this.api.esOrganizador()) {
        void this.cargarMisEventos();
      }
    });
  }

  /** Carga la lista de eventos propios (solo organizadores). */
  async cargarMisEventos(): Promise<void> {
    if (!this.api.esOrganizador()) return;
    try {
      this.misEventos.set(await this.api.listarMisEventos());
    } catch {
      /* la lista es auxiliar: el crear/editar sigue disponible */
    }
  }

  /** Pone un evento propio en el formulario con todos sus campos. */
  editarEvento(evento: MiEventoOrganizador): void {
    const inicio = evento.start_at ?? '';
    const comuna = Array.isArray(evento.communes)
      ? (evento.communes[0]?.name ?? null)
      : (evento.communes?.name ?? null);
    const categoria = [...new Set((evento.event_categories ?? []).flatMap(rel => {
      const categorias = Array.isArray(rel.categories) ? rel.categories : [rel.categories];
      return categorias.flatMap(cat => cat?.name ? [cat.name] : []);
    }))];
    this.categorias.set([...new Set([...CATEGORIAS, ...categoria])]);
    this.fechasOriginales = { inicio, fin: evento.end_at ?? null };
    this.editandoId.set(evento.id);
    this.formulario.patchValue({
      titulo: evento.title,
      descripcion: evento.description ?? '',
      fecha: inicio.length >= 10 ? inicio.slice(0, 10) : new Date().toISOString().slice(0, 10),
      fechaTermino: evento.end_at ? evento.end_at.slice(0, 10) : '',
      hora: inicio.length >= 16 ? inicio.slice(11, 16) : '12:00',
      horaTermino: evento.end_at ? evento.end_at.slice(11, 16) : '12:00',
      modalidad: evento.location_precision === 'online' ? 'Virtual' : 'Presencial',
      publico: evento.audience ?? 'Todo público',
      categoria,
      comuna,
      direccion: evento.address || evento.venue || '',
      accesibilidad: '',
      inscripcion: '',
      precio: evento.price_text ?? '',
      imagenUrl: evento.image_url ?? '',
      enlaceInscripcion: '',
      paginaOficial: evento.official_url ?? '',
      gratuito: evento.is_free !== false
    });
    this.enviado.set(false);
    this.errorServidor.set(null);
    document.getElementById('ec-publish-form')?.scrollIntoView({ behavior: 'smooth' });
  }

  /** Elimina un evento propio (con confirmación). */
  async eliminarMiEvento(eventoId: string): Promise<void> {
    if (!window.confirm('¿Eliminar este evento definitivamente?')) return;
    try {
      await this.api.eliminarEvento(eventoId);
      if (this.editandoId() === eventoId) this.editandoId.set(null);
      await this.cargarMisEventos();
    } catch (e: unknown) {
      this.errorServidor.set((e as { message?: string }).message || 'No se pudo eliminar el evento.');
    }
  }

  /**
   * Autoservicio desde el bloqueo por rol: pasa la cuenta a organizador.
   * Al cambiar el rol, la plantilla deja de mostrar el bloqueo y renderiza
   * el formulario, sin recargar la página.
   */
  async activarCuentaOrganizador(): Promise<void> {
    if (this.activandoOrganizador()) return;
    this.activandoOrganizador.set(true);
    this.errorServidor.set(null);
    try {
      await this.api.convertirEnOrganizador();
    } catch (e: unknown) {
      const err = e as { message?: string };
      this.errorServidor.set(
        err.message || 'No se pudo activar la cuenta de organizador. Intenta más tarde.'
      );
    } finally {
      this.activandoOrganizador.set(false);
    }
  }

  errorPara(campo: CampoPublicar): string | null {
    const ctrl: AbstractControl | null = this.formulario.get(campo);
    if (!ctrl || !(ctrl.dirty || ctrl.touched)) return null;
    const errors: ValidationErrors | null = ctrl.errors;
    if (!errors) return null;

    const mensajes: Record<CampoPublicar, Record<string, string>> = {
      titulo: {
        required: 'Dale un nombre al evento.',
        minlength: 'El nombre debe tener al menos 4 caracteres.'
      },
      descripcion: {
        required: 'Cuenta brevemente de qué se trata el evento.',
        minlength: 'La descripción debe tener al menos 20 caracteres.'
      },
      fecha: {
        required: 'Selecciona una fecha para el evento.'
      },
      categoria: {
        required: 'Elige una categoría.'
      },
      comuna: {
        required: 'Selecciona la comuna donde se realizará.'
      },
      direccion: {
        required: 'Indica la dirección o lugar de referencia.'
      }
    };

    const primera = Object.keys(errors)[0];
    return mensajes[campo]?.[primera] ?? 'Revisa este campo.';
  }

  async publicar(): Promise<void> {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      const primerInvalido = document.querySelector<HTMLElement>(
        'ion-input.ng-invalid input, ion-textarea.ng-invalid textarea, ion-select.ng-invalid button'
      );
      primerInvalido?.focus();
      return;
    }

    this.cargando.set(true);

    const valores = this.formulario.value;
    const fechaIso = (valores.fecha ?? new Date().toISOString()).slice(0, 10);

    const nuevoEvento: Evento = {
      id: 'ev-' + Math.random().toString(36).slice(2, 8),
      titulo: valores.titulo!,
      descripcion: valores.descripcion!,
      imagen: valores.imagenUrl?.trim()
        ? valores.imagenUrl!
        : `https://picsum.photos/seed/${Date.now()}/800/600`,
      fecha: fechaIso,
      fechaTermino: (valores.fechaTermino || undefined) as string | undefined,
      hora: valores.hora || '12:00',
      recinto: valores.direccion!,
      direccion: valores.direccion!,
      comuna: valores.comuna!,
      region: 'Metropolitana',
      modalidad: (valores.modalidad || 'Presencial') as Evento['modalidad'],
      categoria: valores.categoria![0] as Evento['categoria'],
      categorias: valores.categoria as Evento['categoria'][],
      organizador: 'Tu organización',
      precio: valores.gratuito ? '' : (valores.precio || 'Con costo'),
      gratuito: !!valores.gratuito,
      publico: valores.publico || 'Todo público',
      accesibilidad: valores.accesibilidad || undefined,
      inscripcion: valores.inscripcion || undefined,
      enlaceInscripcion: '#',
      fuente: 'Publicación de organizador',
      paginaOficial: valores.paginaOficial || '#',
      ultimaComprobacion: new Date().toISOString().slice(0, 10),
      estado: 'proximo'
    };

    // Si no se cambió fecha/hora, mantener también segundos, fracción y zona.
    const fechaHora = (fecha: string, hora: string, original: string | null): string =>
      original && original.slice(0, 10) === fecha && original.slice(11, 16) === hora
        ? original : `${fecha}T${hora}:00`;
    try {
      const borrador = {
        title: nuevoEvento.titulo,
        description: nuevoEvento.descripcion,
        start_at: fechaHora(nuevoEvento.fecha, nuevoEvento.hora!, this.fechasOriginales?.inicio ?? null),
        end_at: nuevoEvento.fechaTermino
          ? fechaHora(nuevoEvento.fechaTermino.slice(0, 10), valores.horaTermino!, this.fechasOriginales?.fin ?? null)
          : null,
        address: nuevoEvento.direccion,
        venue: nuevoEvento.direccion,
        is_free: nuevoEvento.gratuito,
        price_text: nuevoEvento.precio || null,
        image_url: nuevoEvento.imagen,
        audience: nuevoEvento.publico,
        comuna: nuevoEvento.comuna,
        modalidad: nuevoEvento.modalidad,
        official_url: valores.paginaOficial?.trim() ? valores.paginaOficial!.trim() : undefined,
        categories: valores.categoria!
      };
      // CP-F3-OWN-001: si hay evento en edición, se actualiza el propio
      // (la Edge Function verifica la titularidad por external_key).
      const editando = this.editandoId();
      if (editando) {
        await this.api.actualizarEvento(editando, borrador);
        this.editandoId.set(null);
      } else {
        await this.eventosService.publicarSupabase(borrador);
      }
      await this.cargarMisEventos();
      await this.eventosService.cargarEventos();
      this.enviado.set(true);
      setTimeout(() => this.router.navigateByUrl('/home'), 1800);
    } catch (e: unknown) {
      const err = e as { message?: string; code?: string };
      this.errorServidor.set(
        err.message || 'No se pudo publicar. Revisa tu conexión e inténtalo de nuevo.'
      );
    } finally {
      this.cargando.set(false);
    }
  }
}

