import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, timer } from 'rxjs';
import { map, share } from 'rxjs/operators';

interface CountdownTime {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  message: string;
  episode?: number;
}

interface EpisodeSchedule {
  episode: number;
  releaseDate: Date;
}

@Injectable({
  providedIn: 'root'
})
export class EpisodeCountdownService {
  private countdown$ = new BehaviorSubject<CountdownTime>({ days: 0, hours: 0, minutes: 0, seconds: 0, message: '' });
  private readonly SEASON_2_SCHEDULE: EpisodeSchedule[] = [
    {
      episode: 8,
      releaseDate: new Date('2025-03-07T02:00:00Z')
    },
    {
      episode: 9,
      releaseDate: new Date('2025-03-14T02:00:00Z')
    },
    {
      episode: 10,
      releaseDate: new Date('2025-03-21T02:00:00Z')
    }
  ];

  constructor() {
    this.startCountdown();
  }

  private startCountdown() {
    timer(0, 1000).pipe(
      map(() => this.calculateTimeUntilNextEpisode()),
      share()
    ).subscribe(time => {
      this.countdown$.next(time);
    });
  }

  private calculateTimeUntilNextEpisode(): CountdownTime {
    const now = new Date();
    const nextEpisode = this.getNextEpisodeInfo(now);
    
    if (!nextEpisode) {
      return {
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        message: 'Season 2 has concluded. Stay tuned for Season 3!'
      };
    }

    const diff = nextEpisode.releaseDate.getTime() - now.getTime();

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const message = this.generateMessage(nextEpisode);

    return {
      days,
      hours,
      minutes,
      seconds,
      message,
      episode: nextEpisode.episode
    };
  }

  private generateMessage(episodeInfo: EpisodeSchedule): string {
    const localTime = episodeInfo.releaseDate.toLocaleTimeString(undefined, { 
      hour: 'numeric', 
      minute: 'numeric',
      hour12: true 
    });
    const localDate = episodeInfo.releaseDate.toLocaleDateString(undefined, { 
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
    
    return `Episode ${episodeInfo.episode} releases: ${localDate} at ${localTime}`;
  }

  private getNextEpisodeInfo(fromDate: Date): EpisodeSchedule | null {
    return this.SEASON_2_SCHEDULE.find(episode => 
      episode.releaseDate.getTime() > fromDate.getTime()
    ) || null;
  }

  getCountdown(): Observable<CountdownTime> {
    return this.countdown$.asObservable();
  }
} 