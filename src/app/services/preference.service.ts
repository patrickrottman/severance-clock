import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class PreferenceService {
  private readonly WELCOME_MODAL_KEY = 'severance-welcome-modal-shown';
  
  constructor() { }
  
  /**
   * Checks if the welcome modal has been shown before
   */
  hasSeenWelcomeModal(): boolean {
    return localStorage.getItem(this.WELCOME_MODAL_KEY) === 'true';
  }
  
  /**
   * Marks the welcome modal as seen
   */
  markWelcomeModalAsSeen(): void {
    localStorage.setItem(this.WELCOME_MODAL_KEY, 'true');
  }
} 