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
          onError?: (event: { data: number }) => void;
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
  private apiLoaded = false;

  constructor() {
    this.loadYouTubeAPI();
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

  private loadYouTubeAPI(): Promise<void> {
    return new Promise((resolve) => {
      if (window.YT && window.YT.Player) {
        this.apiLoaded = true;
        resolve();
        return;
      }

      // Create a global callback
      const previousCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        this.apiLoaded = true;
        if (previousCallback) {
          previousCallback();
        }
        resolve();
      };

      // Load the API if not already loading
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      }
    });
  }

  private async initPlayer(): Promise<void> {
    if (this.playerReadyPromise) {
      return this.playerReadyPromise;
    }

    this.playerReadyPromise = new Promise(async (resolve, reject) => {
      try {
        // Wait for API to load
        await this.loadYouTubeAPI();

        // Create player element if it doesn't exist
        let playerElement = document.getElementById('youtube-player');
        if (!playerElement) {
          playerElement = document.createElement('div');
          playerElement.id = 'youtube-player';
          document.body.appendChild(playerElement);
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
            onError: (event: { data: number }) => {
              console.error('YouTube Player Error:', event.data);
              reject(new Error(`YouTube Player Error: ${event.data}`));
            },
            onStateChange: (event) => {
              this.isPlayingSubject.next(event.data === window.YT.PlayerState.PLAYING);
            }
          }
        });
      } catch (error) {
        console.error('Error initializing YouTube player:', error);
        reject(error);
      }
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
    try {
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
    } catch (error) {
      console.error('Error toggling play state:', error);
    }
  }
} 