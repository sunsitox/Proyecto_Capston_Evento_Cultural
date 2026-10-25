import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-evento-card-skeleton',
  standalone: true,
  template: `
    @if (layout === 'lista') {
      <div class="ec-skeleton ec-skeleton--list" aria-hidden="true">
        <div class="ec-skeleton__img"></div>
        <div class="ec-skeleton__body">
          <div class="ec-skeleton__line ec-skeleton__line--xs"></div>
          <div class="ec-skeleton__line ec-skeleton__line--lg"></div>
          <div class="ec-skeleton__line ec-skeleton__line--md"></div>
        </div>
      </div>
    } @else {
      <div class="ec-skeleton ec-skeleton--grid" aria-hidden="true">
        <div class="ec-skeleton__img ec-skeleton__img--grid"></div>
        <div class="ec-skeleton__body">
          <div class="ec-skeleton__line ec-skeleton__line--xs"></div>
          <div class="ec-skeleton__line ec-skeleton__line--lg"></div>
          <div class="ec-skeleton__line ec-skeleton__line--md"></div>
        </div>
      </div>
    }
  `,
  styleUrl: './evento-card-skeleton.component.scss'
})
export class EventoCardSkeletonComponent {
  @Input() layout: 'grid' | 'lista' = 'grid';
}

