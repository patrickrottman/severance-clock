import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { YoutubeAudioService } from '../../services/youtube-audio.service';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.scss']
})
export class FooterComponent {
  isFullscreen = false;

  constructor(public youtubeAudioService: YoutubeAudioService) {}

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      // Enter fullscreen
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      // Exit fullscreen
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }

  toggleMusic() {
    this.youtubeAudioService.togglePlay();
  }
} 