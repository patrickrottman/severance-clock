import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NumberGridComponent } from './components/number-grid/number-grid.component';
import { BinsComponent } from './components/bins/bins.component';
import { LocationHeaderComponent } from './components/location-header/location-header.component';
import { WelcomeModalComponent } from './components/welcome-modal/welcome-modal.component';
import { FooterComponent } from './components/footer/footer.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    NumberGridComponent,
    BinsComponent,
    LocationHeaderComponent,
    WelcomeModalComponent,
    FooterComponent
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'severence-clock';
  isFullScreen = false;
  
  toggleFullScreen() {
    if (!document.fullscreenElement) {
      // Enter fullscreen
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
      }
      this.isFullScreen = true;
    } else {
      // Exit fullscreen
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      this.isFullScreen = false;
    }
  }
  
  constructor() {
    // Listen for fullscreen change events
    document.addEventListener('fullscreenchange', () => {
      this.isFullScreen = !!document.fullscreenElement;
    });
  }
}
