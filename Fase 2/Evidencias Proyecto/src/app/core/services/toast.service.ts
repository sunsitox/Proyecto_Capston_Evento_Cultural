import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly mensaje = signal('');
  readonly visible = signal(false);

  async mostrar(mensaje: string, duracion = 2000): Promise<void> {
    this.mensaje.set(mensaje);
    this.visible.set(true);

    await new Promise((r) => setTimeout(r, duracion));
    this.visible.set(false);
  }
}

