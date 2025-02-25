import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NumberGridComponent } from './components/number-grid/number-grid.component';
import { BinsComponent } from './components/bins/bins.component';
import { LocationHeaderComponent } from './components/location-header/location-header.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    NumberGridComponent,
    BinsComponent,
    LocationHeaderComponent
  ],
  template: `
    <div class="severance-container">
      <app-location-header></app-location-header>
      <app-number-grid></app-number-grid>
      <app-bins></app-bins>
    </div>
  `,
  styles: [`
    .severance-container {
      background-color: #0a192f;
      height: 100vh;
      display: flex;
      flex-direction: column;
      color: #00ffff;
      font-family: 'Courier New', monospace;
      overflow: hidden;
      border: 1px solid rgba(0, 255, 255, 0.3);
    }
  `]
})
export class AppComponent {
  title = 'severance-time';
}
