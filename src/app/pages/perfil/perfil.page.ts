import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonIcon, IonButton, IonItem, IonLabel } from '@ionic/angular';
import { RecomendacionService } from '../../core/services/recomendacion.service';
import { ApiService } from '../../core/services/api.service';
import { PasswordRulesValidator } from '../../shared/validators/password-rules.validator';
import { RecommendationEmptyStateComponent } from '../../shared/components/recommendation-empty-state/recommendation-empty-state.component';

/**
 * Perfil de usuario (invitado o registrado).
 */
@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [RouterLink, FormsModule, ReactiveFormsModule, IonIcon, IonButton, IonItem, IonLabel, RecommendationEmptyStateComponent],
  templateUrl: './perfil.page.html',
  styleUrl: './perfil.page.scss'
})
export class PerfilPage {
  readonly recomendacion = inject(RecomendacionService);
  readonly api = inject(ApiService);
  private readonly router = inject(Router);

  /** Estado del flujo de "eliminar cuenta" (doble confirmación). */
  readonly zonaPeligroAbierta = signal(false);
  readonly confirmandoEliminar = signal(false);
  readonly errorEliminar = signal<string | null>(null);
  readonly eliminando = signal(false);

  /** Texto exacto que la persona debe tipear para habilitar el botón final. */
  readonly fraseConfirmacion = 'ELIMINAR';
  textoConfirmacion = '';

  // ------------------------------------------------------------------
  // Edición del perfil (nombre, imagen, contraseña)
  // ------------------------------------------------------------------

  private readonly fb = inject(FormBuilder);

  /** Panel de edición plegable. */
  readonly editandoPerfil = signal(false);
  readonly guardandoNombre = signal(false);
  readonly subiendoImagen = signal(false);
  /** Mensaje de éxito compartido de la sección (nombre e imagen). */
  readonly mensajePerfil = signal<string | null>(null);
  readonly errorPerfil = signal<string | null>(null);

  /** Nombre visible mientras se edita (ngModel de texto). */
  nombreTemporal = '';

  /** ¿La sesión viene de Google? Su imagen y nombre vienen del proveedor. */
  readonly esGoogle = computed(() => this.api.usuario()?.proveedor === 'google');

  /** Modo del selector de la imagen de la sesión: sólo informativo aquí. */
  readonly avatarDeSesion = computed(() => this.api.usuario()?.avatarUrl);

  abrirEdicion(): void {
    this.nombreTemporal = this.api.usuario()?.nombre ?? '';
    this.formClave.reset();
    this.mensajePerfil.set(null);
    this.errorPerfil.set(null);
    this.editandoPerfil.set(true);
  }

  cerrarEdicion(): void {
    this.editandoPerfil.set(false);
  }

  async guardarNombre(): Promise<void> {
    if (this.guardandoNombre()) return;
    if (!this.nombreTemporal.trim()) {
      this.errorPerfil.set('El nombre no puede quedar vacío.');
      return;
    }
    this.guardandoNombre.set(true);
    this.errorPerfil.set(null);
    try {
      await this.api.actualizarPerfilDatos(this.nombreTemporal);
      this.mensajePerfil.set('Nombre actualizado.');
    } catch (e: unknown) {
      const err = e as { message?: string };
      this.errorPerfil.set(err.message || 'No se pudo guardar el nombre. Intenta de nuevo.');
    } finally {
      this.guardandoNombre.set(false);
    }
  }

  /** Tamaño máximo de imagen (2 MB) aceptado en el perfil. */
  private static readonly IMAGEN_MAX = 2 * 1024 * 1024;

  /** Selector de imagen: valida tipo/tamaño y sube a Storage. */
  elegirImagen(event: Event): void {
    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0];
    input.value = ''; // permite re-seleccionar el mismo archivo después
    if (!archivo) return;
    if (!archivo.type.startsWith('image/')) {
      this.errorPerfil.set('Elige una imagen (JPEG, PNG o WebP).');
      return;
    }
    if (archivo.size > PerfilPage.IMAGEN_MAX) {
      this.errorPerfil.set('La imagen supera los 2 MB.');
      return;
    }
    void this.subirImagen(archivo);
  }

  private async subirImagen(archivo: File): Promise<void> {
    this.subiendoImagen.set(true);
    this.errorPerfil.set(null);
    try {
      await this.api.subirAvatar(archivo, archivo.name);
      this.mensajePerfil.set('Imagen actualizada.');
    } catch (e: unknown) {
      const err = e as { message?: string };
      this.errorPerfil.set(err.message || 'No se pudo subir la imagen. Intenta de nuevo.');
    } finally {
      this.subiendoImagen.set(false);
    }
  }

  // ---------- Cambio de contraseña (cuenta con sesión y contraseña) ----------

  readonly formClave = this.fb.nonNullable.group(
    {
      nueva: ['', [Validators.required, Validators.minLength(8), PasswordRulesValidator.conReglasFuertes()]],
      confirmar: ['']
    },
    { validators: PasswordRulesValidator.coincide('nueva', 'confirmar') }
  );
  readonly cambiandoClave = signal(false);
  readonly mensajeClave = signal<string | null>(null);
  readonly errorClave = signal<string | null>(null);

  get claveIncoherente(): boolean {
    return this.formClave.hasError('coiniden');
  }

  async guardarClave(): Promise<void> {
    if (this.cambiandoClave()) return;
    if (this.formClave.invalid) {
      this.formClave.markAllAsTouched();
      return;
    }
    this.cambiandoClave.set(true);
    this.errorClave.set(null);
    this.mensajeClave.set(null);
    try {
      await this.api.actualizarContrasena(this.formClave.getRawValue().nueva);
      this.mensajeClave.set('Contraseña actualizada.');
      this.formClave.reset();
    } catch (e: unknown) {
      const err = e as { message?: string };
      this.errorClave.set(
        err.message || 'No se pudo cambiar la contraseña. Vuelve a iniciar sesión e inténtalo de nuevo.'
      );
    } finally {
      this.cambiandoClave.set(false);
    }
  }

  cerrarSesion(): void {
    this.api.salir();
    this.router.navigateByUrl('/home');
  }

  toggleZonaPeligro(): void {
    this.zonaPeligroAbierta.update((v) => !v);
    this.confirmandoEliminar.set(false);
    this.errorEliminar.set(null);
    this.textoConfirmacion = '';
  }

  pedirConfirmacionEliminar(): void {
    this.confirmandoEliminar.set(true);
  }

  /** La frase coincide (ignora espacios de sobra). */
  get puedeEliminar(): boolean {
    return this.textoConfirmacion.trim() === this.fraseConfirmacion;
  }

  async confirmarEliminar(): Promise<void> {
    if (!this.puedeEliminar || this.eliminando()) return;
    this.eliminando.set(true);
    this.errorEliminar.set(null);
    try {
      await this.api.eliminarCuenta();
      this.router.navigateByUrl('/home');
    } catch (e: unknown) {
      const err = e as { message?: string };
      this.errorEliminar.set(err.message || 'No se pudo eliminar la cuenta. Intenta más tarde.');
    } finally {
      this.eliminando.set(false);
    }
  }

  /** Categorías distintas exploradas vía señales (sin descartes). */
  readonly interesesExplorados = this.recomendacion.interesesExplorados;

  readonly totalSenales = this.recomendacion.totalSenales;

  /**
   * "Ver recomendaciones" desde Preferencias: el componente ya guardó la
   * selección; aquí sólo llevamos a la persona a la página Para ti (antes el
   * botón guardaba sin navegar y parecía no hacer nada).
   */
  verRecomendaciones(): void {
    void this.router.navigateByUrl('/para-ti');
  }

  /** Etiquetas de preferencias activas (para el bloque de resumen). */
  readonly preferenciasActivas = computed(() => {
    const p = this.recomendacion.preferencias();
    const chips: string[] = [];
    chips.push(...p.categorias);
    chips.push(...p.regiones, ...p.comunas);
    if (p.modalidades.length > 0) chips.push(...p.modalidades);
    if (p.precio === 'gratis') chips.push('Gratis');
    if (p.precio === 'costo') chips.push('Con costo');
    if (p.accesibilidad) chips.push('Accesible');
    return chips;
  });
}
