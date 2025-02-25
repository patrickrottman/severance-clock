import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError, map } from 'rxjs';

interface IpApiResponse {
  status: string;
  country: string;
  countryCode: string;
  region: string;
  regionName: string;
  city: string;
  zip: string;
  lat: number;
  lon: number;
  timezone: string;
  isp: string;
  org: string;
  as: string;
  query: string;
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

    return this.http.get<IpApiResponse>('http://ip-api.com/json')
      .pipe(
        map(response => {
          if (response.status === 'success' && response.city) {
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