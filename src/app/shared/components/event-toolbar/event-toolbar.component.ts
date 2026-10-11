import { Component, EventEmitter, Input, Output, inject, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  UntypedFormBuilder,
  UntypedFormControl,
  UntypedFormGroup,
  ReactiveFormsModule
} from '@angular/forms';
import { IonIcon, IonChip, IonSelect, IonSelectOption } from '@ionic/angular';

export type VistaType = 'grid' | 'lista';
export type OrdenType = 'fecha' | 'nombre' | 'categoria' | 'cercania' | 'actualizacion';

interface OrdenOpcion {
  valor: OrdenType;
  etiqueta: string;
}

const ORDENES: OrdenOpcion[] = [
  { valor: 'fecha', etiqueta: 'Próximos primero' },
  { valor: 'nombre', etiqueta: 'Nombre (A–Z)' },
  { valor: 'categoria', etiqueta: 'Categoría' },
  { valor: 'cercania', etiqueta: 'Cercanía' },
  { valor: 'actualizacion', etiqueta: 'Última actualización' }
];

/**
 * Toolbar de resultados: orden + toggle grid/lista.
 *
 * Ley de Hick: en lugar de cinco chips de orden + dos de vista (7
 * decisiones simultáneas), el orden vive en UN select y la vista en un
 * toggle de dos botones. Es la misma instancia para web (visible) y
 * mobile (oculta por CSS, mobile usa defaults).
 */
@Component({
  selector: 'app-event-toolbar',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IonIcon, IonChip, IonSelect, IonSelectOption],
  templateUrl: './event-toolbar.component.html',
  styleUrl: './event-toolbar.component.scss'
})
export class EventToolbarComponent implements OnChanges {
  private readonly fb = inject(UntypedFormBuilder);

  /** Opciones del select de orden (plantilla). */
  readonly ordenes = ORDENES;

  @Input() ordenPor: OrdenType = 'fecha';
  @Input() vista: VistaType = 'grid';

  @Output() ordenPorChange = new EventEmitter<OrdenType>();
  @Output() vistaChange = new EventEmitter<VistaType>();

  /** Form mínimo que mantiene sincronizado el select con @Input(). */
  readonly form: UntypedFormGroup = this.fb.group({
    orden: new UntypedFormControl(this.ordenPor)
  });

  ngOnChanges(): void {
    // Si el padre cambia el orden (p. ej. preferencias guardadas),
    // reflejarlo en el select sin disparar eventos.
    const control = this.form?.get('orden');
    if (control && control.value !== this.ordenPor) {
      control.setValue(this.ordenPor, { emitEvent: false });
    }
  }

  setOrden(valor: string | null | undefined): void {
    const orden = (ORDENES.find((o) => o.valor === valor)?.valor ?? 'fecha') as OrdenType;
    this.ordenPorChange.emit(orden);
  }

  setVista(v: VistaType): void {
    this.vistaChange.emit(v);
  }
}

