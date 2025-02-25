import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError, map } from 'rxjs';

interface IpapiResponse {
  city: string;
  region: string;
  country_name: string;
}

@Injectable({
  providedIn: 'root'
})
export class LocationService {
  private locationCache: string | null = null;
  private readonly fallbackLocations = [
    'Siena', 'Topeka', 'Helena', 'Boise', 'Denver'
  ];

  constructor(private http: HttpClient) {}

  getLocation(): Observable<string> {
    if (this.locationCache) {
      return of(this.locationCache);
    }

    // Using ipapi.co which supports HTTPS and doesn't require browser permissions
    return this.http.get<IpapiResponse>('https://ipapi.co/json/')
      .pipe(
        map(response => {
          if (response && response.city) {
            this.locationCache = response.city;
            return response.city;
          } else {
            return this.getRandomFallbackLocation();
          }
        }),
        catchError(() => {
          return of(this.getRandomFallbackLocation());
        })
      );
  }

  private getRandomFallbackLocation(): string {
    const random = Math.floor(Math.random() * this.fallbackLocations.length);
    this.locationCache = this.fallbackLocations[random];
    return this.locationCache;
  }
} 