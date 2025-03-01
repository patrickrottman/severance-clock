import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, timer } from 'rxjs';
import { map, share } from 'rxjs/operators';

interface CountdownTime {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class EpisodeCountdownService {
  private countdown$ = new BehaviorSubject<CountdownTime>({ days: 0, hours: 0, minutes: 0, seconds: 0, message: '' });

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
    const nextEpisode = this.getNextEpisodeDate(now);
    const diff = nextEpisode.getTime() - now.getTime();

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const message = this.generateMessage(nextEpisode);

    return { days, hours, minutes, seconds, message };
  }

  private generateMessage(nextEpisode: Date): string {
    const localTime = nextEpisode.toLocaleTimeString(undefined, { 
      hour: 'numeric', 
      minute: 'numeric',
      hour12: true 
    });
    const localDate = nextEpisode.toLocaleDateString(undefined, { 
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
    
    return `Next episode release: ${localDate} at ${localTime}`;
  }

  private getNextEpisodeDate(fromDate: Date): Date {
    const nextThursday = new Date(fromDate);
    nextThursday.setUTCHours(1, 0, 0, 0); // 9 PM ET = 1 AM UTC
    
    // Move to next Thursday if needed
    while (nextThursday.getUTCDay() !== 4 || nextThursday.getTime() <= fromDate.getTime()) {
      nextThursday.setUTCDate(nextThursday.getUTCDate() + 1);
    }
    
    return nextThursday;
  }

  getCountdown(): Observable<CountdownTime> {
    return this.countdown$.asObservable();
  }
} 