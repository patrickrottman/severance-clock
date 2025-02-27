import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimeService } from '../../services/time.service';
import { gsap } from 'gsap';

interface Bin {
  id: string;
  percentage: number;
  active: boolean;
}

@Component({
  selector: 'app-bins',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bins.component.html',
  styleUrls: ['./bins.component.scss']
})
export class BinsComponent implements OnInit {
  bins: Bin[] = [
    { id: '01', percentage: 0, active: false },
    { id: '02', percentage: 0, active: false },
    { id: '03', percentage: 0, active: false },
    { id: '04', percentage: 0, active: false },
    { id: '05', percentage: 0, active: false }
  ];

  hourPercentage: number = 0;
  hexAddressLeft: string = '0x15A5A7';
  hexAddressRight: string = '0x0AE7A4';
  private currentBin: number = -1;
  
  constructor(private timeService: TimeService) {}

  ngOnInit() {
    // Initialize bins with current percentages from service
    const initialPercentages = this.timeService.getBinPercentages();
    this.bins.forEach((bin, index) => {
      bin.percentage = initialPercentages[index];
    });

    // Listen for hour percentage updates
    this.timeService.hourPercentage$.subscribe(percentage => {
      this.hourPercentage = percentage;
      this.updateHexAddress(); // Update hex address based on hour percentage
    });
    
    // Listen for bin percentage updates
    this.timeService.binPercentages$.subscribe(percentages => {
      this.bins.forEach((bin, index) => {
        bin.percentage = percentages[index];
      });
    });

    // Listen for time binning events
    this.timeService.binningEvent$.subscribe((binIndex: number) => {
      // Reset all bins first
      this.bins.forEach(bin => bin.active = false);
      
      // Activate the selected bin if valid index
      if (binIndex >= 0 && binIndex < this.bins.length) {
        this.bins[binIndex].active = true;
        this.currentBin = binIndex;
        
        // Increment the bin percentage in the service
        this.timeService.incrementBinPercentage(binIndex);
        
        // Animate the bin lid opening
        this.animateBinLid(binIndex);
      }
    });
  }
  
  /**
   * Animates the bin lid opening and closing
   */
  private animateBinLid(binIndex: number): void {
    if (binIndex < 0 || binIndex >= this.bins.length) return;
    
    // Get the bin elements
    setTimeout(() => {
      const binElements = document.querySelectorAll('.bin');
      if (!binElements || binElements.length <= binIndex) return;
      
      const bin = binElements[binIndex] as HTMLElement;
      if (!bin) return;
      
      const lidLeft = bin.querySelector('.lid-left') as HTMLElement;
      const lidRight = bin.querySelector('.lid-right') as HTMLElement;
      
      if (lidLeft && lidRight) {
        // Add perspective to bin for 3D effect
        gsap.set(bin, { perspective: 300 });
        
        // Open the lids more slowly with 3D rotation
        gsap.to(lidLeft, {
          rotateX: -70, // Open upward with 3D rotation
          duration: 0.8, // Slower animation
          ease: 'power1.inOut' // Smoother easing
        });
        
        gsap.to(lidRight, {
          rotateX: -70, // Open upward with 3D rotation
          duration: 0.8, // Slower animation
          ease: 'power1.inOut' // Smoother easing
        });
        
        // Close the lids after a longer delay
        setTimeout(() => {
          gsap.to([lidLeft, lidRight], {
            rotateX: 0, // Close back to original position
            duration: 0.8, // Slower closing
            ease: 'power2.inOut' // Smoother easing
          });
        }, 3000); // Much longer delay before closing (increased from 1500ms to 3000ms)
      }
    }, 0);
  }

  // Update hex address based on hour percentage for a dynamic effect
  private updateHexAddress(): void {
    // Create dynamic hex values that change with the hour percentage
    const baseValue = Math.floor(this.hourPercentage * 2.55); // 0-255 range
    const offsetValue = (baseValue + 128) % 256; // Offset for second value
    
    // Format values as hex with leading zeros
    const hexBase = baseValue.toString(16).toUpperCase().padStart(2, '0');
    const hexOffset = offsetValue.toString(16).toUpperCase().padStart(2, '0');
    
    // Update hex addresses
    this.hexAddressLeft = `0x${hexBase}A5${hexOffset}`;
    this.hexAddressRight = `0x${hexOffset}E7${hexBase}`;
  }
} 