import { Component, inject } from '@angular/core';
import { EventosService } from './core/services/eventos.service';
import { IonApp, IonRouterOutlet } from '@ionic/angular';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  private readonly eventos = inject(EventosService);
  constructor() { void this.eventos.cargarEventos(); }
}