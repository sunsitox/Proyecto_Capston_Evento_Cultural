import { ApiService } from '../../core/services/api.service';
import { Component, inject, signal } from '@angular/core';
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
  readonly categorias = CATEGORIAS;
  readonly comunas = COMUNAS;
  readonly modalidades = MODALIDADES;
  readonly publicos = PUBLICOS;
  readonly enviado = signal(false);
  readonly cargando = signal(false);
  readonly activandoOrganizador = signal(false);
  readonly errorServidor = signal<string | null>(null);
  readonly api = inject(ApiService);

  private readonly fb = inject(FormBuilder);
  private readonly eventosService = inject(EventosService);
  private readonly router = inject(Router);

  readonly formulario = this.fb.group({
    titulo: ['', [Validators.required, Validators.minLength(4)]],
    descripcion: ['', [Validators.required, Validators.minLength(20)]],
    fecha: [new Date().toISOString(), Validators.required],
    fechaTermino: [''],
    hora: ['12:00'],
    modalidad: ['Presencial' as string, Validators.required],
    publico: ['Todo público'],
    categoria: [null as string | null, Validators.required],
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
      categoria: valores.categoria as Evento['categoria'],
      categorias: [valores.categoria as Evento['categoria']],
      organizador: 'Tu organización',
      precio: !!valores.gratuito ? '' : (valores.precio || 'Con costo'),
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

    try {
      // INSERT directo a Supabase con el JWT del usuario (RLS gobierna la
      // escritura). Sin la política INSERT publique, PostgREST responde 403 y
      // aquí se explica al organizador por qué.
      await this.eventosService.publicarSupabase({
        title: nuevoEvento.titulo,
        description: nuevoEvento.descripcion,
        start_at: `${nuevoEvento.fecha}T${nuevoEvento.hora}:00`,
        end_at: nuevoEvento.fechaTermino ? `${nuevoEvento.fechaTermino}T${nuevoEvento.hora}:00` : null,
        address: nuevoEvento.direccion,
        venue: nuevoEvento.direccion,
        is_free: nuevoEvento.gratuito,
        price_text: nuevoEvento.precio || null,
        image_url: nuevoEvento.imagen,
        audience: nuevoEvento.publico,
        categories: [nuevoEvento.categoria]
      });
      await this.eventosService.cargarEventos();
      this.enviado.set(true);
      setTimeout(() => this.router.navigateByUrl('/home'), 1800);
    } catch (e: unknown) {
      const err = e as { message?: string; code?: string };
      if (err.code === '42501' || /row-level security|permission denied/i.test(err.message ?? '')) {
        this.errorServidor.set(
          'Publicación aún no habilitada: falta la política RLS INSERT para organizadores '
          + '(segunda entrega). El evento no se guardó.'
        );
      } else {
        this.errorServidor.set(err.message || 'No se pudo publicar. Inicia sesión e inténtalo de nuevo.');
      }
    } finally {
      this.cargando.set(false);
    }
  }
}

