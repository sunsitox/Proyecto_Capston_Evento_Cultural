import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

/**
 * La API View Transitions aborta la transición (reject del `ready`
 * promise) cuando la pestaña está oculta o el usuario interrumpe la
 * navegación. Esos rechazos son abandonos benignos del navegador y se
 * suprimen aquí para no ensuciar la consola con errores no capturados;
 * cualquier otro rejection sí se reporta.
 */
window.addEventListener('unhandledrejection', (event) => {
  const razon = event.reason as { name?: string; message?: string } | null;
  if (
    razon &&
    (razon.name === 'AbortError' ||
      razon.name === 'InvalidStateError' ||
      razon.name === 'TimeoutError' ||
      /view transition/i.test(razon.message ?? ''))
  ) {
    event.preventDefault();
  }
});

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
