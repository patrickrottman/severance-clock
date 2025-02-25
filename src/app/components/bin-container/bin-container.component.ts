import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimeService } from '../../services/time.service';
import { ResponsiveService } from '../../services/responsive.service';

interface Bin {
  id: number;
  label: string;
  percentage: number;
  isActive: boolean;
}

@Component({
  selector: 'app-bin-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bin-container" [class.compact]="isCompact">
      <div class="progress-bar">
        <div class="progress" [style.width]="totalProgress + '%'"></div>
      </div>
      <div class="bins">
        @for (bin of bins; track bin.id) {
          <div class="bin" [class.active]="bin.isActive">
            <div class="bin-label">{{ bin.label }}</div>
            <div class="bin-box"></div>
            <div class="bin-percentage">{{ bin.percentage }}%</div>
          </div>
        }
      </div>
      <div class="hex-address">0x15D84A : 0x0AEAFC</div>
    </div>
  `,
  styles: [`
    .bin-container {
      display: flex;
      flex-direction: column;
      padding: 1rem;
      margin-top: auto;
      position: relative;
      border-top: 1px solid rgba(0, 255, 255, 0.2);
    }

    .progress-bar {
      height: 2px;
      background: rgba(0, 255, 255, 0.1);
      margin-bottom: 2rem;
      position: relative;
    }

    .progress {
      height: 100%;
      background: rgba(0, 255, 255, 0.6);
      transition: width 0.5s ease;
    }

    .bins {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
    }

    .bin {
      flex: 1;
      text-align: center;
      opacity: 0.6;
      transition: all 0.3s ease;
    }

    .bin.active {
      opacity: 1;
    }

    .bin-label {
      font-size: 0.8rem;
      margin-bottom: 0.5rem;
      letter-spacing: 1px;
    }

    .bin-box {
      height: 60px;
      border: 1px solid rgba(0, 255, 255, 0.3);
      margin: 0.5rem;
      transition: all 0.3s ease;
    }

    .bin.active .bin-box {
      border-color: rgba(0, 255, 255, 0.8);
      box-shadow: 0 0 10px rgba(0, 255, 255, 0.2);
    }

    .bin-percentage {
      font-size: 0.7rem;
      opacity: 0.8;
    }

    .hex-address {
      position: absolute;
      bottom: -1.5rem;
      left: 50%;
      transform: translateX(-50%);
      font-size: 0.7rem;
      opacity: 0.4;
      letter-spacing: 1px;
    }

    .compact {
      .bins {
        flex-wrap: wrap;
      }

      .bin {
        flex: 1 1 calc(33.33% - 1rem);
      }

      .bin-box {
        height: 40px;
      }
    }

    @media (max-width: 768px) {
      .bin-container {
        padding: 0.5rem;
      }

      .bins {
        flex-wrap: wrap;
        gap: 0.5rem;
      }

      .bin {
        flex: 1 1 calc(50% - 0.5rem);
      }
    }
  `]
})
export class BinContainerComponent implements OnInit {
  bins: Bin[] = [];
  isCompact = false;
  totalProgress = 0;

  constructor(
    private timeService: TimeService,
    private responsiveService: ResponsiveService
  ) {}

  ngOnInit() {
    this.initializeBins();
    
    this.responsiveService.screenSize$.subscribe(size => {
      this.isCompact = size === 'xs' || size === 'sm';
      this.adjustBinsForScreenSize(size);
    });

    // Slowly increase progress throughout the day
    this.updateProgress();
  }

  private initializeBins() {
    this.bins = Array.from({ length: 5 }, (_, i) => ({
      id: i,
      label: `O${i + 1}`,
      percentage: Math.floor(Math.random() * 100),
      isActive: false
    }));
  }

  private adjustBinsForScreenSize(size: string) {
    const numBins = size === 'xs' ? 3 : size === 'sm' ? 4 : 5;
    this.bins = this.bins.slice(0, numBins);
  }

  private updateProgress() {
    // Calculate progress based on time of day (9am to 5pm)
    const now = new Date();
    const start = new Date(now).setHours(9, 0, 0, 0);
    const end = new Date(now).setHours(17, 0, 0, 0);
    const current = now.getTime();
    
    if (current < start) {
      this.totalProgress = 0;
    } else if (current > end) {
      this.totalProgress = 100;
    } else {
      this.totalProgress = ((current - start) / (end - start)) * 100;
    }
  }

  activateBin(index: number) {
    this.bins.forEach(bin => bin.isActive = false);
    if (this.bins[index]) {
      this.bins[index].isActive = true;
      this.bins[index].percentage = Math.min(
        this.bins[index].percentage + Math.floor(Math.random() * 10),
        99
      );
    }
  }
} 