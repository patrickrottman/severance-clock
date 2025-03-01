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
};

@Injectable({
  providedIn: 'root'
})
export class YoutubeAudioService {
  private player: YouTubePlayer | null = null;
  private isPlayingSubject = new BehaviorSubject<boolean>(false);
  isPlaying$ = this.isPlayingSubject.asObservable();
  private playerReadyPromise: Promise<void> | null = null;

  constructor() {
    // Load YouTube IFrame API
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }
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

  async togglePlay() {
    if (!this.player) {
      await this.initPlayer();
    }

    if (this.player) {
      if (this.isPlayingSubject.value) {
        this.player.pauseVideo();
      } else {
        this.player.playVideo();
      }
    }
  }
} 