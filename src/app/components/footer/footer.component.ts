import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { YoutubeAudioService } from '../../services/youtube-audio.service';
import { EpisodeCountdownService } from '../../services/episode-countdown.service';
import { Observable } from 'rxjs';

interface CountdownTime {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  message: string;
}

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.scss']
})
export class FooterComponent implements OnInit {
  isFullscreen = false;
  countdown$!: Observable<CountdownTime>;

  constructor(
    public youtubeAudioService: YoutubeAudioService,
    private episodeCountdownService: EpisodeCountdownService
  ) {}

  ngOnInit() {
    this.countdown$ = this.episodeCountdownService.getCountdown();
  }

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

  formatNumber(n: number): string {
    return n.toString().padStart(2, '0');
  }
} 