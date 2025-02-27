import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LocationService } from '../../services/location.service';
import { TimeService } from '../../services/time.service';

@Component({
  selector: 'app-location-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './location-header.component.html',
  styleUrls: ['./location-header.component.scss']
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