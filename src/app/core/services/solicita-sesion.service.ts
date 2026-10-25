import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular';

/**
 * Aviso para invitados que intentan guardar intereses: "Me interesa" está
 * disponible sólo con cuenta. Presenta un único aviso a la vez y lleva a la
 * persona a la pantalla de login al confirmar.
 */
@Injectable({ providedIn: 'root' })
export class SolicitaSesionService {
  private readonly alertas = inject(AlertController);
  private readonly router = inject(Router);

  /** Evita alertas apiladas si se pulsa rápido en varias tarjetas. */
  private avisoAbierto = false;

  async avisoParaGuardarInteres(): Promise<void> {
    if (this.avisoAbierto) return;
    this.avisoAbierto = true;
    const aviso = await this.alertas.create({
      header: 'Inicia sesión para guardar',
      message:
        'Para marcar eventos como "Me interesa" necesitas una cuenta. Tus intereses se guardan en tu perfil.',
      buttons: [
        { text: 'Ahora no', role: 'cancel' },
        {
          text: 'Ir a iniciar sesión',
          role: 'confirm',
          handler: () => {
            void this.router.navigateByUrl('/login');
          }
        }
      ]
    });
    await aviso.present();
    await aviso.onDidDismiss();
    this.avisoAbierto = false;
  }
}
