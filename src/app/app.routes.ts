import { Routes } from '@angular/router';
import { MainLayoutComponent } from './layout/main-layout/main-layout.component';
import { adminGuard } from './pages/admin/admin.guard';

/**
 * RUTA OFUSCADA DEL PANEL: el ingreso vive en /v00/admin y el dashboard en
 * /v00/admin/panel. No hay enlaces en la interfaz pública: la única forma de
 * llegar es tecleando la URL (requisito del equipo para el acceso interno).
 */
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
      },
      {
        // Fijar contraseña nueva tras el enlace de recuperación         // (/auth/callback?type=recovery routea aquí).
        path: 'restablecer-contrasena',
        loadComponent: () =>
          import('./pages/restablecer-contrasena/restablecer-contrasena.page').then(
            (m) => m.RestablecerContrasenaPage
          )
      }
    ]
  },
  {
    // Ingreso del panel: ruta poco intuitiva, sin enlaces públicos.
    path: 'v00/admin',
    loadComponent: () =>
      import('./pages/admin/admin-login.page').then((m) => m.AdminLoginPage)
  },
  {
    path: 'v00/admin/panel',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./pages/admin/admin-dashboard.page').then((m) => m.AdminDashboardPage)
  },
  {
    // Gestión de páginas de extracción (ocultar fuentes).
    path: 'v00/admin/paginas',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./pages/admin/admin-paginas.page').then((m) => m.AdminPaginasPage)
  },
  {
    // Explorador del catálogo cargado (vigentes y vencidos).
    path: 'v00/admin/eventos',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./pages/admin/admin-eventos.page').then((m) => m.AdminEventosPage)
  },
  {
    // Entidades organizadoras agregadas desde el catálogo.
    path: 'v00/admin/organizadores',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./pages/admin/admin-organizadores.page').then(
        (m) => m.AdminOrganizadoresPage
      )
  },
  { path: '**', redirectTo: 'home' }
];
