import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PreferenceService } from '../../services/preference.service';
import { gsap } from 'gsap';

@Component({
  selector: 'app-welcome-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './welcome-modal.component.html',
  styleUrls: ['./welcome-modal.component.scss']
})
export class WelcomeModalComponent implements OnInit {
  @Output() closed = new EventEmitter<void>();
  
  showModal = false;
  contentVisible = false;
  
  constructor(private preferenceService: PreferenceService) {}
  
  ngOnInit(): void {
    // Check if user has seen the modal before
    if (!this.preferenceService.hasSeenWelcomeModal()) {
      setTimeout(() => {
        this.showModal = true;
        
        // Small delay for entrance animation
        setTimeout(() => {
          this.contentVisible = true;
          
          // Add GSAP glitch effect
          this.addGlitchEffect();
        }, 100);
      }, 1000); // Delay showing the modal so the page loads first
    }
  }
  
  closeModal(): void {
    this.contentVisible = false;
    
    // Wait for exit animation to complete
    setTimeout(() => {
      this.showModal = false;
      this.preferenceService.markWelcomeModalAsSeen();
      this.closed.emit();
    }, 300);
  }
  
  onOverlayClick(event: MouseEvent): void {
    // Close only if clicking the overlay, not the modal content
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.closeModal();
    }
  }
  
  private addGlitchEffect(): void {
    const modalContent = document.querySelector('.modal-content') as HTMLElement;
    if (!modalContent) return;
    
    // Add subtle glitch effect at random intervals
    const glitchInterval = setInterval(() => {
      if (!this.showModal) {
        clearInterval(glitchInterval);
        return;
      }
      
      // Create a short glitch animation
      gsap.to(modalContent, {
        duration: 0.1,
        x: () => Math.random() * 3 - 1.5,
        y: () => Math.random() * 2 - 1,
        opacity: 0.95,
        skewX: 0.3,
        onComplete: () => {
          // Restore to normal
          gsap.to(modalContent, {
            duration: 0.1,
            x: 0,
            y: 0,
            opacity: 1,
            skewX: 0
          });
        }
      });
    }, 3000); // Random glitch every 3 seconds
  }
} 