import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LocationService } from '../../services/location.service';
import { TimeService } from '../../services/time.service';

@Component({
  selector: 'app-location-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="location-header">
      <div class="location-name">{{ locationName }}</div>
      <div class="progress-indicator">
        <div class="progress-text">{{progressPercent}}% Complete</div>
      </div>
      <div class="company-logo">LUMON</div>
    </div>
  `,
  styles: [`
    .location-header {
      display: flex;
      align-items: center;
      padding: 0.5rem 1rem;
      border-bottom: 1px solid rgba(0, 255, 255, 0.2);
      height: 40px;
      font-family: 'Courier Prime', 'Courier New', monospace;
      background-color: #0a192f;
      color: #00ffff;
    }

    .location-name {
      font-size: 1.4rem;
      letter-spacing: 1px;
      padding-right: 1rem;
      border-right: 1px solid rgba(0, 255, 255, 0.2);
      margin-right: 1rem;
      min-width: 100px;
    }

    .progress-indicator {
      flex: 1;
      display: flex;
      align-items: center;
      margin-left: 1rem;
    }

    .progress-text {
      font-size: 1.4rem;
      color: rgba(0, 255, 255, 0.8);
    }

    .company-logo {
      margin-left: auto;
      font-size: 1.2rem;
      letter-spacing: 1px;
      opacity: 0.7;
      border: 1px solid rgba(0, 255, 255, 0.3);
      border-radius: 50%;
      padding: 0.5rem 1rem;
    }

    /* Media queries for mobile responsiveness */
    @media (max-width: 768px) {
      .location-name {
        font-size: 1.1rem;
        min-width: 80px;
      }
      
      .progress-text {
        font-size: 1.1rem;
      }
      
      .company-logo {
        font-size: 1rem;
        padding: 0.4rem 0.8rem;
      }
    }
    
    @media (max-width: 480px) {
      .location-header {
        padding: 0.4rem 0.6rem;
      }
      
      .location-name {
        font-size: 0.9rem;
        padding-right: 0.5rem;
        margin-right: 0.5rem;
        min-width: 60px;
      }
      
      .progress-text {
        font-size: 0.9rem;
      }
      
      .company-logo {
        font-size: 0.8rem;
        padding: 0.3rem 0.6rem;
      }
    }
  `]
})
export class LocationHeaderComponent implements OnInit {
  locationName = 'Loading...';
  progressPercent = 0; // Will be updated from TimeService
  
  constructor(
    private locationService: LocationService,
    private timeService: TimeService
  ) {}
  
  ngOnInit() {
    this.locationService.getLocation().subscribe(
      (location) => {
        this.locationName = location;
      },
      (error) => {
        console.error('Error fetching location:', error);
        this.locationName = 'Siena'; // Fallback
      }
    );
    
    // Subscribe to hour percentage updates
    this.timeService.hourPercentage$.subscribe(percentage => {
      this.progressPercent = percentage;
    });
  }
} 