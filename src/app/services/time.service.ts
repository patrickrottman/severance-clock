import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

interface TimeState {
  hour: number;
  minute: number;
  shouldReveal: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class TimeService {
  private currentTimeSubject = new BehaviorSubject<TimeState>({ 
    hour: 0, 
    minute: 0,
    shouldReveal: false
  });
  currentTime$ = this.currentTimeSubject.asObservable();
  
  // Add a subject for bin events
  private binningSubject = new Subject<number>();
  binningEvent$ = this.binningSubject.asObservable();
  
  // Add hour percentage subject
  private hourPercentageSubject = new BehaviorSubject<number>(0);
  hourPercentage$ = this.hourPercentageSubject.asObservable();
  
  private timeUpdateInterval: any;
  private activeBin = 0;
  private lastRevealTime = 0;

  // Add bin percentage tracking
  private binPercentages: number[] = [
    Math.floor(Math.random() * 70) + 10, // Start with random values between 10-80%
    Math.floor(Math.random() * 70) + 10,
    Math.floor(Math.random() * 70) + 10,
    Math.floor(Math.random() * 70) + 10,
    Math.floor(Math.random() * 70) + 10
  ];
  private binPercentagesSubject = new BehaviorSubject<number[]>([...this.binPercentages]);
  binPercentages$ = this.binPercentagesSubject.asObservable();
  
  constructor() {
    this.startTimeUpdate();
  }

  private startTimeUpdate() {
    this.updateTime();
    this.timeUpdateInterval = setInterval(() => this.updateTime(), 1000);
  }

  private updateTime() {
    const now = new Date();
    const hour = now.getHours() % 12 || 12; // 12-hour format
    const minute = now.getMinutes();
    
    // Only reveal the time pattern occasionally and briefly
    const currentTime = now.getTime();
    const shouldReveal = currentTime - this.lastRevealTime > 120000 && Math.random() < 0.3;
    
    if (shouldReveal) {
      this.lastRevealTime = currentTime;
      // Schedule the pattern to hide after 15 seconds
      setTimeout(() => {
        this.currentTimeSubject.next({ hour, minute, shouldReveal: false });
      }, 15000);
    }
    
    this.currentTimeSubject.next({ hour, minute, shouldReveal });
  }

  binTime() {
    // Cycle through bins with some randomness
    this.activeBin = Math.floor(Math.random() * 5);
    
    // Emit the bin event
    this.binningSubject.next(this.activeBin);
    
    return this.activeBin;
  }

  stopTimeUpdate() {
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval);
    }
  }

  // Update hour percentage
  updateHourPercentage(percentage: number): void {
    this.hourPercentageSubject.next(percentage);
  }
  
  // Method to get current bin percentages
  getBinPercentages(): number[] {
    return [...this.binPercentages];
  }
  
  // Method to increment bin percentage when a bin is used
  incrementBinPercentage(binIndex: number): void {
    if (binIndex < 0 || binIndex >= this.binPercentages.length) return;
    
    // Increment by a random amount between 5-15%
    const increment = Math.floor(Math.random() * 11) + 5;
    
    // Don't increment past 100%
    this.binPercentages[binIndex] = Math.min(100, this.binPercentages[binIndex] + increment);
    
    // Check if all bins are at 100%
    if (this.binPercentages.every(percentage => percentage >= 100)) {
      // Reset all bins to 0% if all are full
      this.binPercentages = this.binPercentages.map(() => 0);
    }
    
    // Notify subscribers of the update
    this.binPercentagesSubject.next([...this.binPercentages]);
  }
} 