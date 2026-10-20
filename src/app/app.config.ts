import { APP_INITIALIZER, ApplicationConfig, LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import localeEs from '@angular/common/locales/es';
import { provideRouter, withViewTransitions } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  homeOutline, home, searchOutline, search, heartOutline, heart,
  personOutline, personCircleOutline, calendarOutline, locationOutline,
  chevronForwardOutline, arrowBackOutline, arrowForwardOutline,
  addCircleOutline, logInOutline, mailOutline, lockClosedOutline,
  imageOutline, businessOutline, timeOutline,
  logOutOutline, shareSocialOutline, closeCircleOutline, closeOutline,
  compassOutline, megaphoneOutline,
  gridOutline, listOutline, pricetagOutline, textOutline,
  optionsOutline, checkmarkOutline, storefrontOutline,
  leafOutline, flashOutline, squareOutline,
  mapOutline, ticketOutline,
  videocamOutline, layersOutline, accessibilityOutline,
  peopleOutline, informationCircleOutline, documentTextOutline,
  navigateOutline, sparklesOutline, sparkles, ellipsisVertical,
  chevronBackOutline, chevronDownOutline, todayOutline, calendarClearOutline, refreshOutline,
  cloudOfflineOutline, location, globeOutline, personAddOutline,
  ellipseOutline, checkmarkCircleOutline, pauseOutline, warningOutline
} from 'ionicons/icons';
import { routes } from './app.routes';

// Fechas formateadas en español (DatePipe 'd MMM', 'EEEE d MMMM y', etc.)
registerLocaleData(localeEs);

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    { provide: LOCALE_ID, useValue: 'es-CL' },
    // Forzar 'md' en todo momento: ionicons elige sprite según mode, y sin un
    // mode estable puede construir el `URL()` con una base vacía y lanzar el
    // warning "URL constructor: '' is not a valid URL".
    provideIonicAngular({
      mode: 'md',
      swipeBackEnabled: false,
      hardwareBackButton: false
    }),
    // Registrar el set de iconos una sola vez, antes de que cualquier
    // componente renderice un <ion-icon>. APP_INITIALIZER garantiza que el
    // documento esté listo y `document.baseURI` resuelto.
    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: () => () => {
        addIcons({
          homeOutline, home, searchOutline, search, heartOutline, heart,
          personOutline, personCircleOutline, calendarOutline, locationOutline,
          chevronForwardOutline, arrowBackOutline, arrowForwardOutline,
          addCircleOutline, logInOutline, mailOutline, lockClosedOutline,
          imageOutline, businessOutline, timeOutline,
          logOutOutline, shareSocialOutline, closeCircleOutline, closeOutline,
          compassOutline, megaphoneOutline,
          gridOutline, listOutline, pricetagOutline, textOutline,
          optionsOutline, checkmarkOutline, storefrontOutline,
          leafOutline, flashOutline, squareOutline,
          mapOutline, ticketOutline,
          videocamOutline, layersOutline, accessibilityOutline,
          peopleOutline, informationCircleOutline, documentTextOutline,
          navigateOutline, sparklesOutline, sparkles, ellipsisVertical,
          chevronBackOutline, chevronDownOutline, todayOutline, calendarClearOutline, refreshOutline,
          cloudOfflineOutline, location, globeOutline, personAddOutline,
          ellipseOutline, checkmarkCircleOutline, pauseOutline, warningOutline
        });
      }
    },
    provideRouter(
      routes,
      // Transición nativa del navegador entre pestañas (fade) y hacia la
      // ficha (slide). Las animaciones viven en global.scss y se anulan con
      // prefers-reduced-motion.
      withViewTransitions({
        // El navegador aborta la transición (reject del ready promise) si
        // la pestaña está oculta o el usuario interrumpe la navegación:
        // abandonos benignos que no deben ensuciar la consola. La
        // promesa real no es accesible desde ViewTransitionInfo, así que
        // se suprime globalmente en main.ts.
        onViewTransitionCreated: () => void 0
      })
    )
  ]
};

