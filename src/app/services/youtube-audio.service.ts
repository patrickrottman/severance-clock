import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

// Add YouTube IFrame API types
declare global {
  interface Window {
    YT: {
      Player: new (elementId: string, options: {
        height: string | number;
        width: string | number;
        videoId: string;
        playerVars?: {
          autoplay?: number;
          controls?: number;
          showinfo?: number;
          modestbranding?: number;
          loop?: number;
          playlist?: string;
          fs?: number;
          cc_load_policy?: number;
          iv_load_policy?: number;
          autohide?: number;
        };
        events?: {
          onReady?: () => void;
          onStateChange?: (event: { data: number }) => void;
        };
      }) => {
        playVideo(): void;
        pauseVideo(): void;
        getCurrentTime(): number;
        seekTo(seconds: number, allowSeekAhead: boolean): void;
      };
      PlayerState: {
        PLAYING: number;
      };
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

type YouTubePlayer = {
  playVideo(): void;
  pauseVideo(): void;
  getCurrentTime(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
};

@Injectable({
  providedIn: 'root'
})
export class YoutubeAudioService {
  private player: YouTubePlayer | null = null;
  private isPlayingSubject = new BehaviorSubject<boolean>(false);
  isPlaying$ = this.isPlayingSubject.asObservable();
  private playerReadyPromise: Promise<void> | null = null;
  private readonly STORAGE_KEY = 'youtube_playback_state';
  private saveStateInterval: number | null = null;

  constructor() {
    // Load YouTube IFrame API
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    // Restore state on page load
    this.restoreState();

    // Save state periodically when playing
    this.isPlaying$.subscribe(isPlaying => {
      if (isPlaying && !this.saveStateInterval) {
        this.saveStateInterval = window.setInterval(() => this.saveState(), 5000);
      } else if (!isPlaying && this.saveStateInterval) {
        window.clearInterval(this.saveStateInterval);
        this.saveStateInterval = null;
      }
    });
  }

  private initPlayer(): Promise<void> {
    if (this.playerReadyPromise) {
      return this.playerReadyPromise;
    }

    this.playerReadyPromise = new Promise((resolve) => {
      const tryInit = () => {
        if (!window.YT) {
          setTimeout(tryInit, 100);
          return;
        }

        this.player = new window.YT.Player('youtube-player', {
          height: '0',
          width: '0',
          videoId: 'JRnDYB28bL8',
          playerVars: {
            autoplay: 0,
            controls: 0,
            showinfo: 0,
            modestbranding: 1,
            loop: 1,
            playlist: 'JRnDYB28bL8',
            fs: 0,
            cc_load_policy: 0,
            iv_load_policy: 3,
            autohide: 0
          },
          events: {
            onReady: () => {
              this.restorePlaybackPosition();
              resolve();
            },
            onStateChange: (event) => {
              this.isPlayingSubject.next(event.data === window.YT.PlayerState.PLAYING);
            }
          }
        });
      };

      tryInit();
    });

    return this.playerReadyPromise;
  }

  private saveState() {
    if (this.player && this.isPlayingSubject.value) {
      const state = {
        isPlaying: this.isPlayingSubject.value,
        position: this.player.getCurrentTime(),
        timestamp: Date.now()
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
    }
  }

  private restoreState() {
    const savedState = localStorage.getItem(this.STORAGE_KEY);
    if (savedState) {
      const state = JSON.parse(savedState);
      if (state.isPlaying && Date.now() - state.timestamp < 24 * 60 * 60 * 1000) { // Within 24 hours
        this.initPlayer().then(() => {
          if (this.player) {
            this.player.seekTo(state.position, true);
            if (state.isPlaying) {
              this.player.playVideo();
            }
          }
        });
      }
    }
  }

  private restorePlaybackPosition() {
    const savedState = localStorage.getItem(this.STORAGE_KEY);
    if (savedState && this.player) {
      const state = JSON.parse(savedState);
      if (Date.now() - state.timestamp < 24 * 60 * 60 * 1000) { // Within 24 hours
        this.player.seekTo(state.position, true);
      }
    }
  }

  async togglePlay() {
    if (!this.player) {
      await this.initPlayer();
    }

    if (this.player) {
      if (this.isPlayingSubject.value) {
        this.saveState();
        this.player.pauseVideo();
      } else {
        this.player.playVideo();
      }
    }
  }
} 