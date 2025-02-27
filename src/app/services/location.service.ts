import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError, map } from 'rxjs';

interface GeoJsResponse {
  city: string;
  region: string;
  country: string;
}

@Injectable({
  providedIn: 'root'
})
export class LocationService {
  private readonly CACHE_KEY = 'severance-location-cache';
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  
  private readonly fallbackLocations = [
    'Siena', 'Topeka', 'Helena', 'Boise', 'Denver',
    'Austin', 'Portland', 'Seattle', 'Chicago', 'Boston'
  ];

  constructor(private http: HttpClient) {}

  getLocation(): Observable<string> {
    // Check cache first
    const cachedLocation = this.getCachedLocation();
    if (cachedLocation) {
      return of(cachedLocation);
    }

    // Try geo.js.org - free, unlimited, and CORS enabled
    return this.http.get<GeoJsResponse>('https://get.geojs.io/v1/ip/geo.json').pipe(
      map(response => {
        if (response?.city) {
          this.cacheLocation(response.city);
          return response.city;
        }
        return this.getRandomFallbackLocation();
      }),
      catchError(() => of(this.getRandomFallbackLocation()))
    );
  }

  private getCachedLocation(): string | null {
    const cached = localStorage.getItem(this.CACHE_KEY);
    if (!cached) return null;

    try {
      const { location, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < this.CACHE_DURATION) {
        return location;
      }
    } catch (e) {
      console.error('Error parsing cached location:', e);
    }
    return null;
  }

  private cacheLocation(location: string): void {
    const cache = {
      location,
      timestamp: Date.now()
    };
    localStorage.setItem(this.CACHE_KEY, JSON.stringify(cache));
  }

  private getRandomFallbackLocation(): string {
    const random = Math.floor(Math.random() * this.fallbackLocations.length);
    const location = this.fallbackLocations[random];
    this.cacheLocation(location); // Cache the fallback location too
    return location;
  }
} 