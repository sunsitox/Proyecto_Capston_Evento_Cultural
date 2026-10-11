import { Routes } from '@angular/router';
import { MainLayoutComponent } from './layout/main-layout/main-layout.component';

export const routes: Routes = [
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      { path: '', redirectTo: 'home', pathMatch: 'full' },
      {
        path: 'home',
        loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage)
      },
      {
        // Alias de compatibilidad: la búsqueda vive dentro de Descubrir.
        path: 'buscar',
        loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage)
      },
      {
        // Reemplaza a /favoritos: recomendaciones por señales de interés.
        path: 'para-ti',
        loadComponent: () =>
          import('./pages/para-ti/para-ti.page').then((m) => m.ParaTiPage)
      },
      {
        path: 'calendario',
        loadComponent: () =>
          import('./pages/calendario/calendario.page').then((m) => m.CalendarioPage)
      },
      {
        path: 'mapa',
        loadComponent: () => import('./pages/mapa/mapa.page').then((m) => m.MapaPage)
      },
      {
        path: 'evento/:id',
        loadComponent: () =>
          import('./pages/detalle-evento/detalle-evento.page').then((m) => m.DetalleEventoPage)
      },
      {
        // Compatibilidad: Favoritos fue reemplazado por Para ti.
        path: 'favoritos',
        redirectTo: 'para-ti'
      },
      {
        path: 'publicar',
        loadComponent: () =>
          import('./pages/publicar-evento/publicar-evento.page').then(
            (m) => m.PublicarEventoPage
          )
      },
      {
        path: 'perfil',
        loadComponent: () => import('./pages/perfil/perfil.page').then((m) => m.PerfilPage)
      },
      {
        path: 'login',
        loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage)
      },
      {
        // Regreso de OAuth (Supabase Auth entrega tokens en el fragmento).
        path: 'auth/callback',
        loadComponent: () =>
          import('./pages/auth-callback/auth-callback.page').then(
            (m) => m.AuthCallbackPage
          )
      }
    ]
  },
  { path: '**', redirectTo: 'home' }
];
