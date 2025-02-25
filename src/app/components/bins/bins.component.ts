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
  template: `
    <div class="bins-container">
      <div class="bins-wrapper">
        <div 
          *ngFor="let bin of bins" 
          class="bin" 
          [class.active]="bin.active"
          [class.full]="bin.percentage >= 100"
        >
          <div class="bin-id">
            <div class="lid-left"></div>
            <div class="lid-center">{{ bin.id }}</div>
            <div class="lid-right"></div>
          </div>
          <div class="bin-meter">
            <div class="bin-fill" [style.width.%]="bin.percentage"></div>
          </div>
          <div class="bin-percentage">{{ bin.percentage }}%</div>
        </div>
      </div>
      <div class="hex-address">{{ hexAddressLeft }} : {{ hexAddressRight }}</div>
    </div>
  `,
  styles: [`
    .bins-container {
      width: 100%;
      background-color: #0a192f;
      border-top: 1px solid rgba(0, 255, 255, 0.2);
      display: flex;
      flex-direction: column;
      padding-bottom: 0.5rem;
      position: relative;
      z-index: 5;
    }

    .bins-wrapper {
      display: flex;
      justify-content: space-around;
      padding: 0.5rem;
      perspective: 600px;
      position: relative;
    }

    .bin {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 18%;
      font-family: 'Courier Prime', 'Courier New', monospace;
      transition: all 0.3s ease;
      position: relative;
    }

    .bin-id {
      color: rgba(0, 255, 255, 0.7);
      font-size: 1.2rem;
      padding: 0.3rem 0;
      width: 100%;
      text-align: center;
      border: 1px solid rgba(0, 255, 255, 0.3);
      position: relative;
      display: flex;
      justify-content: center;
      overflow: visible;
      background: rgba(10, 25, 47, 0.95);
      transform-style: preserve-3d;
    }

    .lid-left, .lid-right {
      position: absolute;
      width: 50%;
      height: 100%;
      top: 0;
      background: rgba(10, 25, 47, 0.95);
      border: 1px solid rgba(0, 255, 255, 0.3);
      z-index: 5;
      transform: rotateX(0deg);
      transform-origin: bottom;
      backface-visibility: visible;
    }

    .lid-left {
      left: 0;
      border-right: none;
    }

    .lid-right {
      right: 0;
      border-left: none;
    }

    .lid-center {
      z-index: 1;
    }

    .bin-meter {
      width: 100%;
      height: 1.5rem;
      background: rgba(0, 255, 255, 0.1);
      margin: 0.2rem 0;
      position: relative;
      border: 1px solid rgba(0, 255, 255, 0.3);
    }

    .bin-fill {
      height: 100%;
      background: rgba(0, 255, 255, 0.4);
      transition: width 0.5s ease;
    }

    .bin-percentage {
      color: rgba(0, 255, 255, 0.7);
      font-size: 1rem;
    }

    .bin.active .bin-id {
      color: rgba(0, 255, 255, 1);
      text-shadow: 0 0 10px rgba(0, 255, 255, 0.7);
    }

    .bin.active .bin-fill {
      background: rgba(0, 255, 255, 0.7);
    }

    .bin.full .bin-fill {
      background: rgba(255, 100, 100, 0.7);
    }

    .hex-address {
      color: rgba(0, 255, 255, 0.6);
      font-family: 'Courier Prime', 'Courier New', monospace;
      font-size: 1rem;
      text-align: center;
      margin-top: 0.5rem;
      letter-spacing: 1px;
    }
  `]
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
        }, 1500); // Longer delay before closing
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