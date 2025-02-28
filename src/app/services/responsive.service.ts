import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

type ScreenSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

@Injectable({
  providedIn: 'root'
})
export class ResponsiveService {
  private screenSizeSubject = new BehaviorSubject<ScreenSize>('md');
  screenSize$ = this.screenSizeSubject.asObservable();

  private sizes = {
    xs: 480,
    sm: 768,
    md: 992,
    lg: 1200,
    xl: 1400
  };

  constructor() {
    this.checkScreenSize();
    window.addEventListener('resize', () => this.checkScreenSize());
  }

  private checkScreenSize() {
    const width = window.innerWidth;
    
    if (width <= this.sizes.xs) {
      this.screenSizeSubject.next('xs');
    } else if (width <= this.sizes.sm) {
      this.screenSizeSubject.next('sm');
    } else if (width <= this.sizes.md) {
      this.screenSizeSubject.next('md');
    } else if (width <= this.sizes.lg) {
      this.screenSizeSubject.next('lg');
    } else {
      this.screenSizeSubject.next('xl');
    }
  }

  getGridSize(screenSize: ScreenSize): number {
    switch (screenSize) {
      case 'xs': return 8;
      case 'sm': return 10;
      case 'md': return 20;
      case 'lg': return 25;
      case 'xl': return 30;
      default: return 20;
    }
  }
} 