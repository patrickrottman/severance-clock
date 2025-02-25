import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimeService } from '../../services/time.service';
import { ResponsiveService } from '../../services/responsive.service';
import { gsap } from 'gsap';
import { fromEvent, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

interface GridNumber {
  id?: number;
  value: number;
  isSelected: boolean;
  isTimePattern: boolean;
  isHovered: boolean;
  opacity: number;
  x: number;
  y: number;
  scale: number;
  rotation?: number;
}

@Component({
  selector: 'app-number-grid',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './number-grid.component.html',
  styleUrls: ['./number-grid.component.scss']
})
export class NumberGridComponent implements OnInit, OnDestroy {
  numbers: GridNumber[] = [];
  gridColumns = 'repeat(13, 1fr)';
  cursorPosition = { x: 0, y: 0 };
  isSelecting = false;
  formattedTime = '';
  hourPercentage = 0; // Track percentage of current hour
  
  // Getter for selected count used in the template
  get selectedCount(): number {
    return this.numbers.filter(n => n.isSelected).length;
  }
  
  private currentTimeDigits: number[] = [];
  private timeSelectionTimeout: any;
  private timeDisplayTimeout: any;
  private isAnimating = false;
  private lastCheckedMinute = -1;
  private _animationStartTime: number | null = null;
  private _lastCursorMove: number = 0;
  private _cursorTimelines: gsap.core.Timeline[] = [];
  private resizeSubscription: Subscription | null = null;

  constructor(
    private timeService: TimeService,
    private responsiveService: ResponsiveService
  ) {}

  ngOnInit() {
    // Initialize grid first
    this.initializeGrid();
    
    // Add resize event listener with aggressive debounce
    this.resizeSubscription = fromEvent(window, 'resize')
      .pipe(debounceTime(750)) // Very aggressive debounce of 750ms
      .subscribe(() => {
        console.log('Window resize detected - resetting everything');
        this.resetEverything();
      });
    
    // Get current minute for tracking changes
    const now = new Date();
    this.lastCheckedMinute = now.getMinutes();
    console.log(`Initial minute set to: ${this.lastCheckedMinute}`);
    
    // Initialize hour percentage
    this.updateHourPercentage();
    
    // Initialize cursor position to a valid location
    this.setCursorPosition(window.innerWidth * 0.3, window.innerHeight * 0.3);
    
    // Add a safety timeout to prevent animation from getting stuck
    setInterval(() => {
      if (this.isAnimating) {
        console.log('Animation safety check - how long has animation been running?');
        // If animation has been running for more than 60 seconds, force reset
        // Increased from 20 seconds to 60 seconds to accommodate slower animations
        const animatingTooLong = this._animationStartTime && 
                                (Date.now() - this._animationStartTime > 60000);
        if (animatingTooLong) {
          console.warn('Animation appears stuck - forcing reset');
          this.resetAnimationState();
          
          // Reset cursor to a valid position
          this.setCursorPosition(window.innerWidth * 0.3, window.innerHeight * 0.3);
        }
      }
      
      // If cursor hasn't moved in 30 seconds, ensure it's visible
      if (Date.now() - this._lastCursorMove > 30000) {
        console.log('Cursor hasn\'t moved in 30 seconds, ensuring visibility');
        const isVisible = this.cursorPosition.x > 0 && this.cursorPosition.y > 0 &&
                         this.cursorPosition.x < window.innerWidth && 
                         this.cursorPosition.y < window.innerHeight;
        if (!isVisible) {
          this.setCursorPosition(window.innerWidth * 0.3, window.innerHeight * 0.3);
        }
      }
    }, 5000);
    
    // Start with quick initial time selection (without binning)
    setTimeout(() => {
      console.log('Starting initial time selection');
      this.beginAnimation();
      this.quickInitialTimeSelection().then(() => {
        this.endAnimation();
        console.log('Initial time selection complete');
      }).catch(err => {
        console.error('Error in initial time selection:', err);
        this.endAnimation();
      });
    }, 1000);
    
    // Set up a timer to check for minute changes every second
    setInterval(() => {
      this.checkForMinuteChange();
      this.updateHourPercentage(); // Update hour percentage every second
    }, 1000);
    
    // Remove the duplicate time change handler - use only checkForMinuteChange
    // to avoid disposing numbers prematurely
    this.timeService.currentTime$.subscribe(time => {
      // Just update our current time tracking without disposing anything
      this.currentTimeDigits = [
        Math.floor(time.hour / 10),
        time.hour % 10,
        Math.floor(time.minute / 10),
        time.minute % 10
      ];
    });
    
    this.responsiveService.screenSize$.subscribe(size => {
      if (size === 'xs') {
        this.gridColumns = 'repeat(11, 1fr)';
      } else if (size === 'sm') {
        this.gridColumns = 'repeat(12, 1fr)';
      } else {
        this.gridColumns = 'repeat(13, 1fr)';
      }
      this.initializeGrid();
    });
  }

  ngOnDestroy() {
    if (this.timeSelectionTimeout) {
      clearTimeout(this.timeSelectionTimeout);
    }
    if (this.timeDisplayTimeout) {
      clearTimeout(this.timeDisplayTimeout);
    }
    
    // Clean up resize subscription
    if (this.resizeSubscription) {
      this.resizeSubscription.unsubscribe();
      this.resizeSubscription = null;
    }
    
    // Ensure all GSAP animations are cleaned up
    gsap.globalTimeline.clear();
  }

  private updateTimeDisplay(time: { hour: number, minute: number }) {
    this.formattedTime = `${time.hour.toString().padStart(2, '0')}:${time.minute.toString().padStart(2, '0')}`;
    const timeDisplay = document.querySelector('.time-display');
    if (timeDisplay) {
      timeDisplay.classList.add('visible');
      if (this.timeDisplayTimeout) {
        clearTimeout(this.timeDisplayTimeout);
      }
      this.timeDisplayTimeout = setTimeout(() => {
        timeDisplay.classList.remove('visible');
      }, 3000);
    }
  }

  private timeDigitsChanged(newDigits: number[]): boolean {
    return !this.currentTimeDigits.every((digit, i) => digit === newDigits[i]);
  }

  private initializeGrid(): void {
    // Kill any existing animations on numbers
    if (this.numbers.length > 0) {
      this.numbers.forEach(num => {
        gsap.killTweensOf(num);
      });
    }
    
    const match = this.gridColumns.match(/\d+/);
    if (!match) return;
    
    const columns = parseInt(match[0]);
    
    // Calculate rows based on container height and cell size
    const gridContainer = document.querySelector('.grid-container');
    const containerHeight = gridContainer?.clientHeight || 600;
    
    // Validate container dimensions
    if (!gridContainer || containerHeight <= 0) {
      console.warn('Invalid container height, using fallback value');
    }
    
    const cellSize = Math.min(32, window.innerWidth * 0.03); // matches CSS
    const verticalGap = Math.min(8, window.innerHeight * 0.008); // matches CSS
    const rows = Math.floor((containerHeight - 40) / (cellSize + verticalGap)); // -40 for padding
    const totalCells = rows * columns;
    
    // Get current time digits - always get fresh time
    const now = new Date();
    const hour = now.getHours() % 12 || 12;
    const minute = now.getMinutes();
    const timeDigits = [
      Math.floor(hour / 10),
      hour % 10,
      Math.floor(minute / 10),
      minute % 10
    ];
    
    console.log(`Initializing grid with time ${hour}:${minute.toString().padStart(2, '0')}, digits: [${timeDigits.join(', ')}]`);
    console.log(`Grid dimensions: ${columns} columns x ${rows} rows = ${totalCells} cells`);

    // Make sure we have all digits 0-9 in the grid, but prioritize time digits
    let availableNumbers = Array.from({ length: 10 }, (_, i) => i);
    
    // Define safe area (not too close to edges)
    // We need enough space for the pattern to fit without going out of bounds
    const safeRowStart = Math.floor(rows * 0.2);
    const safeRowEnd = Math.floor(rows * 0.8);
    const safeColStart = Math.floor(columns * 0.2);
    const safeColEnd = Math.floor(columns * 0.8);
    
    // Choose a random starting position within safe area
    let startRow = safeRowStart + Math.floor(Math.random() * (safeRowEnd - safeRowStart));
    let startCol = safeColStart + Math.floor(Math.random() * (safeColEnd - safeColStart));
    
    // Randomly choose pattern layout (horizontal or vertical only)
    let patternType = Math.floor(Math.random() * 2); // 0: horizontal, 1: vertical
    
    // Make sure the pattern fits within the grid bounds
    // For horizontal (needs 4 columns of space)
    if (patternType === 0 && startCol > columns - 4) {
      startCol = columns - 4;
    }
    // For vertical (needs 4 rows of space)
    else if (patternType === 1 && startRow > rows - 4) {
      startRow = rows - 4;
    }
    
    // Log pattern type and position for debugging
    console.log(`Using pattern type: ${patternType === 0 ? 'horizontal' : 'vertical'}`);
    console.log(`Start position: row ${startRow}, col ${startCol}`);
    
    // Validate final positions
    if (startRow < 0) startRow = 0;
    if (startCol < 0) startCol = 0;
    if (startRow + (patternType === 1 ? 4 : 1) > rows) {
      // Fallback to horizontal if vertical doesn't fit
      patternType = 0;
      startRow = Math.min(startRow, rows - 1);
    }
    if (startCol + (patternType === 0 ? 4 : 1) > columns) {
      // Fallback to vertical if horizontal doesn't fit
      patternType = 1;
      startCol = Math.min(startCol, columns - 1);
    }

    // Create the time positions array
    let timePositions: number[] = [];
    
    if (patternType === 0) { // Horizontal
      console.log('Using horizontal time pattern');
      // Make sure we have at least 4 columns of space
      if (startCol + 3 < columns) {
        timePositions = [
          startRow * columns + startCol,
          startRow * columns + startCol + 1,
          startRow * columns + startCol + 2,
          startRow * columns + startCol + 3
        ];
      } else {
        // Fallback to a safe position if we can't fit horizontally
        const safeCol = Math.max(0, columns - 4);
        timePositions = [
          startRow * columns + safeCol,
          startRow * columns + safeCol + 1,
          startRow * columns + safeCol + 2,
          startRow * columns + safeCol + 3
        ];
      }
    } else { // Vertical
      console.log('Using vertical time pattern');
      // Make sure we have at least 4 rows of space
      if (startRow + 3 < rows) {
        timePositions = [
          startRow * columns + startCol,
          (startRow + 1) * columns + startCol,
          (startRow + 2) * columns + startCol,
          (startRow + 3) * columns + startCol
        ];
      } else {
        // Fallback to a safe position if we can't fit vertically
        const safeRow = Math.max(0, rows - 4);
        timePositions = [
          safeRow * columns + startCol,
          (safeRow + 1) * columns + startCol,
          (safeRow + 2) * columns + startCol,
          (safeRow + 3) * columns + startCol
        ];
      }
    }
    
    // Double-check all timePositions are valid indexes
    timePositions = timePositions.filter(pos => pos >= 0 && pos < totalCells);
    console.log('Time positions:', timePositions);
    
    // If we don't have exactly 4 positions, use a guaranteed safe option in the center
    if (timePositions.length !== 4) {
      console.warn('Time pattern validation failed, using failsafe center pattern');
      const centerRow = Math.floor(rows / 2) - 1;
      const centerCol = Math.floor(columns / 2) - 1;
      // Use 2x2 as failsafe
      timePositions = [
        centerRow * columns + centerCol,
        centerRow * columns + centerCol + 1,
        (centerRow + 1) * columns + centerCol,
        (centerRow + 1) * columns + centerCol + 1
      ].filter(pos => pos >= 0 && pos < totalCells);
      
      // If still not 4 positions, use alternative failsafe
      if (timePositions.length !== 4) {
        console.error('Failsafe pattern failed, using direct assignment');
        // Just take the first 4 cells of the grid
        timePositions = [0, 1, 2, 3];
      }
    }
    
    // Ensure we're working with the current time digits
    // Special handling for cases with zeros
    if (timeDigits[0] === 0) {
      // For times like 1:30, 2:45, etc. where first digit is 0
      // Ensure the digit 0 is available
      if (!availableNumbers.includes(0)) {
        availableNumbers.push(0);
      }
    }
    
    // Pre-verify: ensure we have all time digits in availableNumbers
    for (const digit of timeDigits) {
      if (!availableNumbers.includes(digit)) {
        console.warn(`Time digit ${digit} not in available numbers, adding it`);
        availableNumbers.push(digit);
      }
    }
    
    // Fill grid with numbers
    this.numbers = Array.from({ length: totalCells }, (_, i) => {
      const isTimePosition = timePositions.indexOf(i) !== -1;
      const timeIndex = timePositions.indexOf(i);
      
      // For time positions, use the actual time digit
      // For other positions, use a random number but ensure 0-9 are available
      let value;
      if (isTimePosition) {
        // Ensure we don't go out of bounds
        if (timeIndex >= 0 && timeIndex < timeDigits.length) {
          value = timeDigits[timeIndex];
          // Remove this digit from available numbers
          const index = availableNumbers.indexOf(value);
          if (index !== -1) {
            availableNumbers.splice(index, 1);
          }
        } else {
          // Failsafe for invalid timeIndex
          console.error(`Invalid timeIndex: ${timeIndex} for position ${i}`);
          value = Math.floor(Math.random() * 10);
        }
      } else {
        // If we need to ensure all digits are available and this cell
        // is one of the first few cells, assign a unique value
        if (availableNumbers.length > 0 && i < availableNumbers.length + 5) {
          const randomIndex = Math.floor(Math.random() * availableNumbers.length);
          value = availableNumbers[randomIndex];
          availableNumbers.splice(randomIndex, 1);
        } else {
          // Otherwise just use a random number
          value = Math.floor(Math.random() * 10);
        }
      }
      
      return {
      id: i,
        value: value,
        isSelected: false,
        isTimePattern: isTimePosition,
        isHovered: false,
        opacity: 0.6 + Math.random() * 0.2,
        x: 0,
        y: 0,
        scale: 1
      };
    });

    // Final validation: verify all time digits are in the grid
    const timeDigitsInGrid = this.numbers.filter(n => n.isTimePattern).map(n => n.value);
    const allDigitsAccounted = timeDigits.every((digit, idx) => 
      this.numbers.some(n => n.isTimePattern && n.value === digit)
    );
    
    if (timeDigitsInGrid.length !== 4 || !allDigitsAccounted) {
      console.error('Time digits are not properly placed in the grid!');
      console.error(`Expected: [${timeDigits.join(', ')}], Got: [${timeDigitsInGrid.join(', ')}]`);
      
      // If failed, do a direct replacement approach
      if (timeDigitsInGrid.length === 4) {
        // If we have 4 cells but wrong values, directly replace them
        for (let i = 0; i < 4; i++) {
          const timeCell = this.numbers.find(n => n.isTimePattern && n.id === timePositions[i]);
          if (timeCell) {
            timeCell.value = timeDigits[i];
          }
        }
        console.log('Directly replaced time digit values');
      } else {
        // Force a regeneration
        return this.initializeGrid();
      }
    } else {
      console.log('Time digits successfully placed in the grid:', timeDigitsInGrid);
    }

    // Set initial positions for entrance animation
    // Numbers will start from outside the grid and scroll in
    this.numbers.forEach((number, index) => {
      // Calculate which direction the number should come from based on its position
      const row = Math.floor(index / columns);
      const col = index % columns;
      
      // Default y position (from top for top half, from bottom for bottom half)
      let startY, startX;
      
      // Determine entrance direction based on position in grid
      if (row < rows/2) {
        // Top half - come from above
        startY = -50 - (Math.random() * 100);
        startX = number.x; // Keep X position
      } else {
        // Bottom half - come from below
        startY = 50 + (Math.random() * 100);
        startX = number.x; // Keep X position
      }
      
      // Apply starting position
      number.y = startY;
      number.x = startX;
      number.opacity = 0; // Start invisible
    });
    
    // Create the entrance animation
    const entranceTimeline = gsap.timeline();
    
    // Animate numbers scrolling into view with a slower, more deliberate pace
    this.numbers.forEach((number, index) => {
      // Stagger the animations for a wave effect
      const delay = Math.random() * 0.8; // Longer random delay for a more mysterious feel
      
      entranceTimeline.to(number, {
        y: 0, // Final position
        x: 0,
        opacity: number.opacity, // Restore original opacity
        duration: 1.5, // Slower entrance
        ease: "power1.inOut", // More subtle easing
        delay: delay
      }, 0); // All start at the same time but with individual delays
    });
    
    // Add floating animation for non-time digits after they arrive
    entranceTimeline.add(() => {
      // Add subtle floating animation only to non-time pattern numbers
      this.numbers.forEach(number => {
        if (!number.isTimePattern) {
          gsap.to(number, {
            y: () => (Math.random() * 8 - 4), // More subtle movement
            duration: 4 + Math.random() * 3, // Much slower floating
            repeat: -1,
            yoyo: true,
            ease: 'sine.inOut' // Gentler sine wave motion
          });
        }
      });
    });
    
    // Start the animation
    entranceTimeline.play();
  }

  private getNumberPosition(element: HTMLElement, context: string = 'unknown'): { x: number; y: number } {
    // Get direct references to the container instead of assuming parent relationships
    const gridContainer = document.querySelector('.grid-container') as HTMLElement;
    if (!gridContainer) {
      console.error(`[${context}] Grid container not found for position calculation`);
      return { x: window.innerWidth * 0.3, y: window.innerHeight * 0.3 };
    }
    
    const containerRect = gridContainer.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    
    // Calculate cursor size - matching CSS values for consistency
    const cursorWidth = 16;  // Virtual cursor width in pixels
    const cursorHeight = 16; // Virtual cursor height in pixels
    
    // Check if the element is actually visible in the container
    if (elementRect.width === 0 || elementRect.height === 0) {
      console.warn(`[${context}] Element has zero dimensions - may not be visible`);
      return {
        x: containerRect.width / 2, 
        y: containerRect.height / 2 
      };
    }
    
    // Ensure element is within container bounds
    if (elementRect.right < containerRect.left || 
        elementRect.left > containerRect.right ||
        elementRect.bottom < containerRect.top ||
        elementRect.top > containerRect.bottom) {
      console.warn(`[${context}] Element is outside container bounds - adjusting position`);
      return {
        x: containerRect.width / 2,
        y: containerRect.height / 2
      };
    }
    
    // Calculate the CENTER of the element relative to the container
    // This is the key to accurate positioning for both hover and click
    const relX = elementRect.left - containerRect.left + (elementRect.width / 2);
    const relY = elementRect.top - containerRect.top + (elementRect.height / 2);
    
    // Adjust for cursor's center point for perfect alignment
    const cursorX = Math.round(relX - (cursorWidth / 2));
    const cursorY = Math.round(relY - (cursorHeight / 2));
    
    // Safety checks - ensure we're not returning negative values
    const safeX = Math.max(0, Math.min(cursorX, containerRect.width - cursorWidth));
    const safeY = Math.max(0, Math.min(cursorY, containerRect.height - cursorHeight));
    
    console.log(`[${context}] Element: (${Math.round(elementRect.left)},${Math.round(elementRect.top)}) | ` +
                `Size: ${Math.round(elementRect.width)}x${Math.round(elementRect.height)} | ` +
                `Container: (${Math.round(containerRect.left)},${Math.round(containerRect.top)}) | ` +
                `Center Point: (${Math.round(relX)},${Math.round(relY)}) | ` +
                `Final Cursor: (${safeX},${safeY})`);
    
    return {
      x: safeX,
      y: safeY
    };
  }

  private async quickInitialTimeSelection() {
    console.log('Performing quick initial time selection');
    
    try {
      // Use the selectTimeDigits function which properly selects the time
      // without binning it
      await this.selectTimeDigits();
      
      // Ensure animation state is properly reset on success
      if (this.isAnimating) {
        console.log('Animation flag still set after initial time selection, resetting');
        this.endAnimation();
      }
      
      console.log('Initial time selection completed successfully');
      return Promise.resolve();
    } catch (error) {
      console.error('Error in quickInitialTimeSelection:', error);
      
      // Force animation state to be reset
      this.endAnimation();
      
      // Reset cursor to a safe position
      this.setCursorPosition(window.innerWidth * 0.3, window.innerHeight * 0.3);
      
      // Still resolve to allow the app to continue
      return Promise.resolve();
    }
  }

  private findTimeDigitCell(value: number): HTMLElement | null {
    const cells = document.querySelectorAll('.number-cell');
    for (let i = 0; i < cells.length; i++) {
      if (this.numbers[i].value === value && !this.numbers[i].isSelected) {
        return cells[i] as HTMLElement;
      }
    }
    return null;
  }

  private async simulateSearching(): Promise<void> {
    const cells = document.querySelectorAll('.number-cell');
    
    // More natural search pattern with slower movements
    const searchPattern = [
      { x: window.innerWidth * 0.3, y: window.innerHeight * 0.3, duration: 1.8 },
      { x: window.innerWidth * 0.7, y: window.innerHeight * 0.3, duration: 1.6 },
      { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5, duration: 1.4 },
      { x: window.innerWidth * 0.3, y: window.innerHeight * 0.7, duration: 1.6 },
      { x: window.innerWidth * 0.7, y: window.innerHeight * 0.7, duration: 1.8 }
    ];

    // Natural cursor movements using absolute pixel values with longer pauses
    for (const position of searchPattern) {
      await this.moveCursorTo(position.x, position.y, position.duration);
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    // Check a few random cells with natural movement
    for (let i = 0; i < 3; i++) {
      const randomCell = cells[Math.floor(Math.random() * cells.length)] as HTMLElement;
      if (randomCell) {
        const pos = this.getNumberPosition(randomCell, 'search');
        await this.moveCursorTo(pos.x, pos.y, 1.2); // Slower movement to each cell
        await new Promise(resolve => setTimeout(resolve, 500)); // Longer pause at each cell
      }
    }
  }

  @HostListener('click', ['$event'])
  async onClick(event: MouseEvent) {
    // Prevent click handling during animations or time transitions
    if (this.isAnimating) {
      console.log('Ignoring click - animation in progress');
      return;
    }
    
    console.log('Manual click triggered reset');
    this.beginAnimation();
    
    // Clear any pending timeouts
    if (this.timeSelectionTimeout) {
      clearTimeout(this.timeSelectionTimeout);
    }
    
    // Reset all number states
    this.clearSelections();
    
    // Throw away all numbers in random directions
    const timeline = gsap.timeline();
    this.numbers.forEach((number, index) => {
      const randomAngle = Math.random() * Math.PI * 2;
      const distance = 500 + Math.random() * 300;
      const duration = 0.6 + Math.random() * 0.4;
      
      timeline.to(number, {
        x: Math.cos(randomAngle) * distance,
        y: Math.sin(randomAngle) * distance,
        opacity: 0,
        scale: 0.5,
        duration: duration,
        ease: 'power2.in',
        delay: Math.random() * 0.2
      }, 0);
    });

    // Wait for throw animation to complete
    await timeline.play();
    await new Promise(resolve => setTimeout(resolve, 300));

    // Reset and regenerate grid
    this.clearSelections();
    this.initializeGrid();
    
    // Get current minute after reset to prevent immediate binning
    const now = new Date();
    this.lastCheckedMinute = now.getMinutes();
    
    // Ensure cursor is visible before starting new animation
    this.setCursorPosition(window.innerWidth * 0.3, window.innerHeight * 0.3);
    
    // Start new animation sequence
    await this.animateTimeSelection();
    this.endAnimation();
  }

  private async animateTimeSelection(): Promise<void> {
    console.log('Starting time selection animation');
    this.beginAnimation();
    
    // Always ensure cursor is at a reasonable starting position
    if (this.cursorPosition.x <= 0 || this.cursorPosition.y <= 0 || 
        !this.cursorPosition.x || !this.cursorPosition.y ||
        this.cursorPosition.x > window.innerWidth || this.cursorPosition.y > window.innerHeight) {
      console.log('Cursor position invalid, resetting');
      this.setCursorPosition(window.innerWidth * 0.3, window.innerHeight * 0.3);
    }
    
    // Reset animation state
    this.clearSelections();
    
    // CRITICAL ADDITION: Wait for DOM to be ready before proceeding
    // This ensures the new grid is fully rendered in the DOM
    console.log('Waiting for DOM to be fully rendered before starting animation...');
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const cells = document.querySelectorAll('.number-cell');
    console.log(`Found ${cells.length} number cells in the DOM`);
    
    // CRITICAL: Verify the cells exist before proceeding
    if (cells.length === 0) {
      console.error('No number cells found in DOM. Waiting longer and retrying...');
      // Wait longer and retry once
      await new Promise(resolve => setTimeout(resolve, 1000));
      const retryCount = document.querySelectorAll('.number-cell').length;
      console.log(`After retry: Found ${retryCount} number cells in the DOM`);
      
      if (retryCount === 0) {
        console.error('Still no number cells found in DOM after retry. Aborting animation.');
        this.endAnimation();
        return Promise.reject(new Error('No number cells found in DOM'));
      }
    }
    
    const now = new Date();
    const hour = now.getHours() % 12 || 12;
    const minute = now.getMinutes();
    
    console.log(`Selecting current time: ${hour}:${minute.toString().padStart(2, '0')}`);
    
    // Find the actual time digits in order
    const timeDigits = [
      { value: Math.floor(hour / 10), label: 'hour tens', index: 0 },
      { value: hour % 10, label: 'hour ones', index: 1 },
      { value: Math.floor(minute / 10), label: 'minute tens', index: 2 },
      { value: minute % 10, label: 'minute ones', index: 3 }
    ];

    // Verify that all needed time digits exist in the grid
    const allTimeDigitsExist = timeDigits.every(digit => 
      this.numbers.some(n => n.isTimePattern && n.value === digit.value)
    );

    // If missing any digits, regenerate the grid and restart
    if (!allTimeDigitsExist) {
      console.warn('Not all time digits found in grid, regenerating...');
      // Kill any animations
      this.numbers.forEach(num => {
        gsap.killTweensOf(num);
      });
      this.clearSelections();
      this.initializeGrid();
      
      // Add subtle floating animation to non-time numbers
      this.addFloatingAnimation();
      
      // Wait a moment then try selection again
      await new Promise(resolve => setTimeout(resolve, 800)); // Increased from 500ms to 800ms
      return this.animateTimeSelection();
    }

    try {
      // Start cursor from a natural position
      this.setCursorPosition(window.innerWidth * 0.3, window.innerHeight * 0.3);
      
      // First, scroll through the grid searching
      await this.simulateSearching();

      // Find all time digit cells with proper indices for each time position
      // Look specifically for cells marked as time pattern cells
      let foundTimeDigitCells: {cell: HTMLElement, index: number, position: number}[] = [];
      
      // CRITICAL ADDITION: Get the most up-to-date DOM elements
      const freshCells = document.querySelectorAll('.number-cell');
      console.log(`Using ${freshCells.length} fresh number cells for finding time digits`);
      
      // Process each time digit in order (hour tens, hour ones, minute tens, minute ones)
      for (let digitPosition = 0; digitPosition < timeDigits.length; digitPosition++) {
        const digit = timeDigits[digitPosition];
        
        // Use the most recent collection of cells
        const availableCells = Array.from(freshCells).map((cell, idx) => ({ 
          cell, 
          idx, 
          isSelected: this.numbers[idx]?.isSelected || false,
          isTimePattern: this.numbers[idx]?.isTimePattern || false,
          value: this.numbers[idx]?.value !== undefined ? this.numbers[idx].value : -1
        })).filter(item => 
          // Ensure we have valid data before filtering
          item.value !== -1 &&
          // Find cells that: match the digit value, are time pattern cells, and aren't already selected
          item.value === digit.value && 
          item.isTimePattern && 
          !item.isSelected &&
          // Ensure this cell isn't already used for another position in our results
          !foundTimeDigitCells.some(found => found.index === item.idx)
        );
        
        if (availableCells.length > 0) {
          // Take the first available match for this position
          const selectedCell = availableCells[0];
          
          // CRITICAL: Verify the element has dimensions before adding it
          const rect = selectedCell.cell.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            foundTimeDigitCells.push({
              cell: selectedCell.cell as HTMLElement,
              index: selectedCell.idx,
              position: digitPosition
            });
            console.log(`Found valid digit ${digit.value} for position ${digitPosition} with dimensions ${rect.width}x${rect.height}`);
          } else {
            console.warn(`Found digit ${digit.value} for position ${digitPosition} but element has zero dimensions - skipping`);
          }
        }
      }
      
      // Sort cells by their position for proper sequence
      foundTimeDigitCells.sort((a, b) => a.position - b.position);
      
      console.log(`Found ${foundTimeDigitCells.length} of 4 required time digits in grid`);
      console.log('Time digits found:', foundTimeDigitCells.map(f => this.numbers[f.index].value));

      if (foundTimeDigitCells.length === 4) {
        // PHASE 1: Move cursor to preview all numbers in sequence
        const cellElements = foundTimeDigitCells.map(f => f.cell);
        
        // Use our new hover method instead of selection box
        await this.hoverTimeDigits(cellElements);
        
        // PHASE 2: Select each number after hovering
        for (const { cell, index } of foundTimeDigitCells) {
          // CRITICAL: Verify the element is still in the DOM and has dimensions
          if (!document.body.contains(cell)) {
            console.warn(`Cell for index ${index} is no longer in the DOM - skipping selection`);
            continue;
          }
          
          const rect = cell.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) {
            console.warn(`Cell for index ${index} has zero dimensions - skipping selection`);
            continue;
          }
          
          const pos = this.getNumberPosition(cell, 'click');
          console.log(`CLICK PHASE: Selecting number at position (${pos.x}, ${pos.y})`);
          
          if (Math.abs(this.cursorPosition.x - pos.x) > 1 || Math.abs(this.cursorPosition.y - pos.y) > 1) {
            await this.moveCursorTo(pos.x, pos.y, 0.4);
            console.log(`CLICK PHASE: Cursor moved to: ${this.cursorPosition.x}, ${this.cursorPosition.y}`);
          } else {
            console.log(`CLICK PHASE: Cursor already close enough to target, skipping movement`);
          }
          
          this.isSelecting = true;
          await this.selectNumber(this.numbers[index]);
          this.isSelecting = false;
          await new Promise(resolve => setTimeout(resolve, 300));
        }

        // PHASE 3: Move cursor away from last number
        if (foundTimeDigitCells.length > 0 && document.body.contains(foundTimeDigitCells[3].cell)) {
          const lastPos = this.getNumberPosition(foundTimeDigitCells[3].cell, 'click-last');
        } else {
          console.warn('Last cell not available for cursor positioning - using fallback');
        }
        
        // COMPLETELY CHANGE APPROACH - Don't use calculated offsets
        // Instead, move cursor to a fixed location far away from any likely number position
        
        console.log('Moving cursor to a safe corner of the grid container');
        
        // Get grid container dimensions
        const gridContainer = document.querySelector('.grid-container') as HTMLElement;
        if (!gridContainer) {
          console.error('Grid container not found for cursor positioning');
          // Fallback to window corner if container not found
          await this.moveCursorTo(window.innerWidth * 0.9, window.innerHeight * 0.1, 0.4);
        } else {
          const containerRect = gridContainer.getBoundingClientRect();
          
          // Move to bottom right corner of the container - far from most number patterns
          const cornerX = containerRect.width * 0.9; // 90% right
          const cornerY = containerRect.height * 0.9; // 90% down
          
          console.log(`Moving cursor to container corner: (${cornerX}, ${cornerY})`);
          await this.moveCursorTo(cornerX, cornerY, 0.4);
          
          // Add small delay to ensure cursor finishes moving
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } else {
        // If we couldn't find all time digits, regenerate and try again
        console.error(`Could only find ${foundTimeDigitCells.length} of 4 time digits, regenerating grid`);
        
        // Kill any animations
        this.numbers.forEach(num => {
          gsap.killTweensOf(num);
        });
        this.clearSelections();
        this.initializeGrid();
        
        // Add subtle floating animation to non-time numbers
        this.addFloatingAnimation();
        
        // Wait longer for the DOM to update before trying again
        await new Promise(resolve => setTimeout(resolve, 1000)); // Increased from 500ms to 1000ms
        return this.animateTimeSelection();
      }

      console.log('Time selection animation complete');
      this.endAnimation();
      return Promise.resolve();
      
    } catch (error) {
      console.error('Error during time selection animation:', error);
      // Ensure we reset the animation state
      this.endAnimation();
      return Promise.reject(error);
    }
  }

  private async hoverTimeDigits(cells: HTMLElement[]): Promise<void> {
    if (cells.length === 0) return Promise.resolve();
    
    console.log(`Hovering over ${cells.length} time digits`);
    
    // Reset any previous hover states
    this.numbers.forEach(num => num.isHovered = false);
    
    // Give the DOM time to render fully before calculating positions
    console.log('Waiting for DOM to fully render before calculating hover positions...');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // First, get fresh references to all number cells
    const allCells = document.querySelectorAll('.number-cell');
    
    // Check that the provided cells are still valid
    const validCells = cells.filter(cell => document.body.contains(cell));
    if (validCells.length !== cells.length) {
      console.warn(`Some cells are no longer in DOM: ${cells.length - validCells.length} missing`);
    }
    
    if (validCells.length === 0) {
      console.error('No valid cells found for hovering');
      return Promise.resolve();
    }
    
    // Calculate positions for all valid cells upfront
    const positions = validCells.map(cell => {
      // Find the index of this cell in the DOM
      const cellIndex = Array.from(allCells).findIndex(c => c === cell);
      if (cellIndex === -1) {
        console.warn(`Cell not found in DOM collection`);
        return null;
      }
      
      // Verify that this cell corresponds to a number in our model
      if (cellIndex >= this.numbers.length) {
        console.warn(`Cell index ${cellIndex} out of bounds for numbers array`);
        return null;
      }
      
      // Get precise position using the same calculation method as for clicks
      const position = this.getNumberPosition(cell, 'hover');
      
      // Validate position
      const isValid = position.x >= 0 && position.y >= 0 && 
                     cellIndex >= 0 && cellIndex < this.numbers.length;
      
      return {
        cell,
        cellIndex,
        position,
        isValid
      };
    }).filter(Boolean) as Array<{
      cell: HTMLElement;
      cellIndex: number;
      position: {x: number; y: number};
      isValid: boolean;
    }>;
    
    console.log(`Calculated ${positions.length} valid positions for hover`);
    
    // IMPROVEMENT: Plan the cursor path to be smoother
    // Sort positions by proximity to create a smoother path
    if (positions.length > 2) {
      // Start with the closest position to current cursor
      let currentPos = { x: this.cursorPosition.x, y: this.cursorPosition.y };
      const sortedPositions = [];
      const remainingPositions = [...positions];
      
      // For each step, find the closest next position
      while (remainingPositions.length > 0) {
        // Find index of closest position
        let closestIdx = 0;
        let closestDist = Number.MAX_SAFE_INTEGER;
        
        remainingPositions.forEach((pos, idx) => {
          const dist = Math.sqrt(
            Math.pow(currentPos.x - pos.position.x, 2) + 
            Math.pow(currentPos.y - pos.position.y, 2)
          );
          if (dist < closestDist) {
            closestDist = dist;
            closestIdx = idx;
          }
        });
        
        // Add closest to sorted list and remove from remaining
        const next = remainingPositions.splice(closestIdx, 1)[0];
        sortedPositions.push(next);
        
        // Update current position
        currentPos = next.position;
      }
      
      // Use the optimized path if we found one
      if (sortedPositions.length === positions.length) {
        console.log('Using optimized hover path for smoother cursor movement');
        positions.length = 0;
        positions.push(...sortedPositions);
      }
    }
    
    // Hover over each cell in sequence with smoother transitions
    for (let i = 0; i < positions.length; i++) {
      const { cell, cellIndex, position, isValid } = positions[i];
      
      if (!isValid) {
        console.warn(`Skipping invalid cell position: ${position.x}, ${position.y}`);
        continue;
      }
      
      // Make sure the cell is still in the DOM before trying to hover over it
      if (!document.body.contains(cell)) {
        console.warn(`Cell was removed from DOM during hover sequence`);
        continue;
      }
      
      console.log(`Hovering over cell ${cellIndex} at position ${position.x}, ${position.y}`);
      
      // Mark the cell as hovered in our model
      this.numbers[cellIndex].isHovered = true;
      
      // Adjust movement duration based on distance from previous position
      let moveDuration = 1.2; // Default duration
      
      // If this isn't the first position, calculate distance from previous
      if (i > 0) {
        const prevPos = positions[i-1].position;
        const distance = Math.sqrt(
          Math.pow(prevPos.x - position.x, 2) + 
          Math.pow(prevPos.y - position.y, 2)
        );
        
        // Scale duration based on distance
        moveDuration = Math.min(2.0, Math.max(0.8, distance / 100));
      }
      
      // Only move cursor if not already very close to target
      if (Math.abs(this.cursorPosition.x - position.x) > 1 || Math.abs(this.cursorPosition.y - position.y) > 1) {
        // Use sine easing for smoother motion
        await this.moveCursorTo(position.x, position.y, moveDuration, 'sine.inOut');
        
        // Small pause to ensure cursor has settled
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Create a single timeline for the scale animation to avoid interruptions
      const scaleTimeline = gsap.timeline();
      
      // Animate the number scaling up more slowly with a smoother curve
      scaleTimeline.to(this.numbers[cellIndex], {
        scale: 1.35,
        duration: 1.2,
        ease: 'sine.inOut' // Gentler sine easing
      })
      .to(this.numbers[cellIndex], {
        scale: 1.15, // Scale back down to a slightly larger than normal size
        duration: 0.9,
        ease: 'sine.inOut',
        delay: 0.5 // Built-in delay at peak scale
      });
      
      // Wait for scale animation to complete
      await new Promise(resolve => {
        scaleTimeline.eventCallback("onComplete", resolve);
      });
      
      // Smaller pause between numbers
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    
    return Promise.resolve();
  }

  private addFloatingAnimation(): void {
    this.numbers.forEach(number => {
      if (!number.isTimePattern) {
        gsap.to(number, {
          y: () => (Math.random() * 10 - 5),
          duration: 2 + Math.random() * 2,
          repeat: -1,
          yoyo: true,
          ease: 'power1.inOut'
        });
      }
    });
  }

  private async disposeSelectedNumbers() {
    // Get selected indices
    const selectedIndices = this.numbers
      .map((num, index) => num.isSelected ? index : -1)
      .filter(index => index !== -1);
    
    if (selectedIndices.length === 0) {
      console.log('No numbers to dispose');
      return Promise.resolve();
    }
    
    console.log('Disposing selected numbers:', selectedIndices);
    
    // Kill ALL ongoing animations
    gsap.globalTimeline.clear();
    
    // Tell TimeService which bin we're targeting
    const binIndex = this.timeService.binTime();
    
    return new Promise<void>((resolve) => {
      // Critical safety timeout - ensures animation never gets stuck
      const mainSafetyTimeout = setTimeout(() => {
        console.warn('CRITICAL SAFETY TIMEOUT - Animation took too long, forcing cleanup');
        this.clearSelections();
        this.endAnimation(); // Ensure animation state is reset
        
        // Remove any stray animation overlay elements that might have been left behind
        const overlays = document.querySelectorAll('body > div[style*="z-index: 9999"]');
        overlays.forEach(overlay => {
          if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
          }
        });
        
        // Restore visibility of all number cells
        const numberCells = document.querySelectorAll('.number-cell');
        Array.from(numberCells).forEach(cell => {
          (cell as HTMLElement).style.visibility = '';
        });
        
        resolve();
      }, 10000); // Increased from 5000 to 10000 (10 seconds) absolute maximum for animation
      
      try {
        // Important: Get all required calculations and references up front
        // before any DOM changes occur
        const gridContainer = document.querySelector('.grid-container') as HTMLElement;
        if (!gridContainer) {
          console.error('Grid container not found');
          this.clearSelections();
          clearTimeout(mainSafetyTimeout);
          return resolve();
        }
        
        const gridRect = gridContainer.getBoundingClientRect();
        const numberCells = document.querySelectorAll('.number-cell');
        
        // ----- CRITICAL: Calculate bin position using window coordinates -----
        let binX, binY;
        const bins = document.querySelectorAll('.bin');
        
        if (bins.length > binIndex) {
          const binElement = bins[binIndex] as HTMLElement;
          const binRect = binElement.getBoundingClientRect();
          
          // Convert to grid container coordinates
          binX = (binRect.left - gridRect.left) + (binRect.width / 2);
          binY = (binRect.top - gridRect.top);

          // Log the exact position for debugging
          console.log(`Bin element found at position: ${binX},${binY} (relative to grid container)`);
          console.log(`Absolute bin position: ${binRect.left + binRect.width/2},${binRect.top} (screen coordinates)`);
        } else {
          // Fallback if bin element not found
          binX = gridRect.width * ((binIndex + 0.5) / 5);
          binY = gridRect.height * 0.95;
          console.log(`Using fallback bin position: ${binX},${binY}`);
        }
        
        // ----- CREATE A COMPLETELY SEPARATE ANIMATION LAYER -----
        // This div will be positioned absolutely and won't be affected by Angular
        const animationOverlay = document.createElement('div');
        animationOverlay.style.position = 'absolute';
        animationOverlay.style.top = '0';
        animationOverlay.style.left = '0';
        animationOverlay.style.width = '100%';
        animationOverlay.style.height = '100%';
        animationOverlay.style.pointerEvents = 'none';
        animationOverlay.style.zIndex = '9999';
        
        // Add overlay to body (NOT to the grid container)
        // This ensures it's completely outside Angular's control
        document.body.appendChild(animationOverlay);
        
        // First pass: collect positions to calculate group center
        let centerX = 0;
        let centerY = 0;
        const positions: {left: number, top: number, width: number, height: number}[] = [];
        
        // Calculate positions and center point
        selectedIndices.forEach(idx => {
          if (idx < numberCells.length) {
            const originalElement = numberCells[idx] as HTMLElement;
            const originalRect = originalElement.getBoundingClientRect();
            positions.push({
              left: originalRect.left,
              top: originalRect.top,
              width: originalRect.width,
              height: originalRect.height
            });
          }
        });
        
        // Calculate center point of all selected numbers
        if (positions.length > 0) {
          positions.forEach(pos => {
            centerX += pos.left + (pos.width / 2);
            centerY += pos.top + (pos.height / 2);
          });
          centerX /= positions.length;
          centerY /= positions.length;
          console.log(`Calculated center point of group: (${Math.round(centerX)}, ${Math.round(centerY)})`);
        } else {
          // Fallback to cursor position if no valid positions
          centerX = gridRect.left + this.cursorPosition.x;
          centerY = gridRect.top + this.cursorPosition.y;
          console.log(`Using fallback center point: (${Math.round(centerX)}, ${Math.round(centerY)})`);
        }
        
        // Second pass: create clones
        const clones: HTMLElement[] = [];
        selectedIndices.forEach(idx => {
          if (idx < numberCells.length) {
            const originalElement = numberCells[idx] as HTMLElement;
            const originalRect = originalElement.getBoundingClientRect();
            
            // Create clone with exact styling but position it in document coordinates
            const clone = originalElement.cloneNode(true) as HTMLElement;
            
            // Position clone at the exact screen position of the original
            clone.style.position = 'fixed'; // Use fixed positioning relative to viewport
            clone.style.left = `${originalRect.left}px`;
            clone.style.top = `${originalRect.top}px`;
            clone.style.width = `${originalRect.width}px`;
            clone.style.height = `${originalRect.height}px`;
            clone.style.zIndex = '10000';
            clone.style.transform = 'none'; // Reset any transforms
            clone.style.transition = 'none'; // Prevent CSS transitions
            
            // Add clone to overlay
            animationOverlay.appendChild(clone);
            clones.push(clone);
            
            // Hide original element
            originalElement.style.visibility = 'hidden';
          }
        });
        
        if (clones.length === 0) {
          console.error('Failed to create clones for animation');
          // Clean up
          document.body.removeChild(animationOverlay);
          this.clearSelections();
          clearTimeout(mainSafetyTimeout);
          return resolve();
        }
        
        console.log(`Created ${clones.length} clones for animation`);
        
        // ----- IMPORTANT: Save original number data before clearing selections -----
        // This allows us to update the model state without affecting the animation
        
        // Clear selections immediately to update the model
        // We're animating clones, so the model can be updated right away
        this.clearSelections();
        
        // ----- ANIMATION SEQUENCE -----
        // Create bin position in fixed coordinates to match our fixed positioned clones
        const binFixedX = gridRect.left + binX; 
        const binFixedY = gridRect.top + binY;
        
        console.log(`Animation targets: Group Center(${Math.round(centerX)},${Math.round(centerY)}) → Bin(${Math.round(binFixedX)},${Math.round(binFixedY)})`);
        
        // Create a flag to track if animation completed normally
        let animationCompleted = false;
        
        // Animation timeline
        const tl = gsap.timeline({ 
          onComplete: () => {
            console.log('Animation timeline completed normally');
            animationCompleted = true;
            
            // Wait a very short moment before cleanup to ensure animation visibility
            setTimeout(() => {
              console.log('Animation complete, removing overlay');
              
              // Remove the animation overlay
              if (document.body.contains(animationOverlay)) {
                document.body.removeChild(animationOverlay);
                console.log('Animation overlay removed');
              }
              
              // Show original elements again
              selectedIndices.forEach(idx => {
                if (idx < numberCells.length) {
                  (numberCells[idx] as HTMLElement).style.visibility = '';
                }
              });
              
              // Clear the main safety timeout since we're done
              clearTimeout(mainSafetyTimeout);
              
              // Resolve promise
              resolve();
            }, 100);
          }
        });
        
        // Step 1: Gather at center point of the group
        tl.to(clones, {
          left: centerX,
          top: centerY,
          scale: 1.2,
          duration: 1.2, // Slower gathering
          ease: "power1.inOut", // More subtle easing
          onStart: () => console.log('Starting gather animation to group center')
        });
        
        // Step 2: Move to bin and fade out - slower for dramatic effect
        tl.to(clones, {
          left: binFixedX,
          top: binFixedY + 20, // Move slightly into the bin
          opacity: 0,
          scale: 0.5,
          duration: 1.8, // Much slower fade out
          ease: "power1.in",
          onStart: () => console.log('Starting bin animation')
        });
        
        // Start the animation
        tl.play();
        
        // Safety timeout that triggers earlier than main timeout
        // to ensure animation doesn't get stuck
        const animationSafetyTimeout = setTimeout(() => {
          if (!animationCompleted) {
            console.warn('Animation safety timeout - animation did not complete normally');
            // Kill the timeline
            tl.kill();
            
            // Force cleanup
            console.log('Forcing animation cleanup');
            
            // Remove overlay
            if (document.body.contains(animationOverlay)) {
              document.body.removeChild(animationOverlay);
            }
            
            // Show original elements
            selectedIndices.forEach(idx => {
              if (idx < numberCells.length) {
                (numberCells[idx] as HTMLElement).style.visibility = '';
              }
            });
            
            // Clear the main safety timeout since we're handling cleanup now
            clearTimeout(mainSafetyTimeout);
            
            // Resolve promise
            resolve();
          }
        }, 5000); // Increased from 2000 to 5000 (5 seconds)
      }
      catch (error) {
        console.error('Error in disposeSelectedNumbers:', error);
        
        // Reset all number cells visibility
        const numberCells = document.querySelectorAll('.number-cell');
        Array.from(numberCells).forEach(cell => {
          (cell as HTMLElement).style.visibility = '';
        });
        
        // Clean up any animation overlays
        const overlays = document.querySelectorAll('body > div[style*="z-index: 9999"]');
        overlays.forEach(overlay => {
          if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
          }
        });
        
        // Reset model state
        this.clearSelections();
        
        // Clear the main safety timeout
        clearTimeout(mainSafetyTimeout);
        
        // Resolve promise
        resolve();
      }
    });
  }

  private async selectTimeDigits(): Promise<void> {
    try {
      const cells = document.querySelectorAll('.number-cell');
      const now = new Date();
      const hour = now.getHours() % 12 || 12;
      const minute = now.getMinutes();
      
      console.log(`Quick select time: ${hour}:${minute.toString().padStart(2, '0')}`);
      
      const timeDigits = [
        Math.floor(hour / 10),
        hour % 10,
        Math.floor(minute / 10),
        minute % 10
      ];

      // Clear any existing selections
      this.clearSelections();

      // Process each time digit in order (0-3 positions)
      let foundTimeDigitCells: {num: GridNumber, idx: number, position: number}[] = [];
      
      for (let position = 0; position < timeDigits.length; position++) {
        const value = timeDigits[position];
        const availableCells = this.numbers
          .map((num, idx) => ({ num, idx }))
          .filter(cell => 
            // Match the value, must be a time pattern cell, and not already selected
            cell.num.value === value && 
            cell.num.isTimePattern && 
            !cell.num.isSelected &&
            // Make sure this cell isn't already in our results
            !foundTimeDigitCells.some(found => found.idx === cell.idx)
          );
          
        if (availableCells.length > 0) {
          foundTimeDigitCells.push({
            ...availableCells[0],
            position: position
          });
        }
      }
      
      // Sort by position to ensure proper sequence
      foundTimeDigitCells.sort((a, b) => a.position - b.position);
      
      console.log(`Found ${foundTimeDigitCells.length} of 4 required time digits for quick select`);
      console.log('Time digits found:', foundTimeDigitCells.map(f => f.num.value));

      if (foundTimeDigitCells.length === 4) {
        // Use cell elements directly with the new hover method
        const cellElements = foundTimeDigitCells.map(f => cells[f.idx] as HTMLElement).filter(Boolean);
        await this.hoverTimeDigits(cellElements);
        
        // PHASE 2: Select each number after hovering
        for (const { num, idx } of foundTimeDigitCells) {
          try {
            const cell = cells[idx] as HTMLElement;
            if (!cell) continue;
            
            const pos = this.getNumberPosition(cell, 'hover');
            
            this.isSelecting = true;
            if (idx > 0) { // Only move cursor if not first number
              await this.moveCursorTo(pos.x, pos.y, 0.4);
            }

            await this.selectNumber(num);
            this.isSelecting = false;
            await new Promise(resolve => setTimeout(resolve, 200));
          } catch (err) {
            console.warn(`Error selecting number ${num.value}:`, err);
            // Mark the number as selected anyway to maintain state
            num.isSelected = true;
          }
        }
      } else {
        // If we couldn't find enough time digits, regenerate the grid
        console.warn(`Could only find ${foundTimeDigitCells.length} of 4 digits for quick select, regenerating`);
        this.initializeGrid();
        
        // Try selection again
        await new Promise(resolve => setTimeout(resolve, 300));
        return this.selectTimeDigits();
      }
      
      return Promise.resolve();
    } catch (error) {
      console.error('Error in selectTimeDigits:', error);
      // Still resolve to avoid blocking further operations
      return Promise.resolve();
    }
  }

  private checkForMinuteChange() {
    // Skip check if animation is already in progress
    if (this.isAnimating) {
      console.log('Skipping minute check - animation in progress');
      
      // Safety check: if animation has been running too long, reset it
      const animatingTooLong = this._animationStartTime && 
                              (Date.now() - this._animationStartTime > 60000);
      if (animatingTooLong) {
        console.warn('Animation has been running too long - forcing reset');
        this.resetAnimationState();
        // Force reset to a clean state
        this.clearSelections();
        this.endAnimation();
        
        // Clean up any animation overlays
        const overlays = document.querySelectorAll('body > div[style*="z-index: 9999"]');
        overlays.forEach(overlay => {
          if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
          }
        });
        
        // Reset cursor to a safe position
        this.setCursorPosition(window.innerWidth * 0.3, window.innerHeight * 0.3);
      }
      
      return;
    }
    
    const now = new Date();
    const currentMinute = now.getMinutes();
    
    // If minute has changed since last check
    if (this.lastCheckedMinute !== -1 && this.lastCheckedMinute !== currentMinute) {
      console.log('MINUTE CHANGED from', this.lastCheckedMinute, 'to', currentMinute);
      
      // Set animating flag immediately to prevent multiple triggers
      this.beginAnimation();
      
      // Update last checked minute immediately to prevent multiple triggers
      this.lastCheckedMinute = currentMinute;
      
      // Step 1: The minute has changed, so dispose of the currently selected numbers
      if (this.numbers.some(n => n.isSelected)) {
        console.log('Disposing selected numbers at minute change');
        
        // Queue the disposal animation
        this.disposeSelectedNumbers().then(() => {
          // After disposal, wait briefly then reinitialize
          setTimeout(() => {
            console.log('Regenerating grid after disposal');
            
            // Clear selections
            this.clearSelections();
            
            // Ensure cursor is in a valid position for next animation
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;
            this.setCursorPosition(windowWidth * 0.3, windowHeight * 0.3);
            console.log('Cursor position reset to:', this.cursorPosition);
            
            // Generate new grid with the correct time
            this.regenerateGridWithCorrectTime().then(() => {
              // CRITICAL CHANGE: Give Angular more time to update the DOM
              // Wait significantly longer before trying to select time digits
              console.log('Grid regenerated, waiting for DOM to fully update before selection...');
              setTimeout(() => {
                // Step 2: Select new numbers for the current minute
                console.log('Starting next time selection animation cycle');
                this.animateTimeSelection().then(() => {
                  // Animation cycle complete
                  this.endAnimation();
                  console.log('Animation cycle complete, ready for next minute change');
                }).catch(err => {
                  console.error('Error in time selection:', err);
                  this.endAnimation();
                });
              }, 1000); // Increase from 0ms to 1000ms (1 second)
            }).catch(err => {
              console.error('Error in grid regeneration:', err);
              this.endAnimation();
            });
          }, 500);
        }).catch(err => {
          console.error('Error in disposal:', err);
          this.endAnimation();
        });
      } else {
        // If no numbers are selected (rare case), just select the current time
        console.log('No selection to dispose, selecting new time');
        this.clearSelections();
        
        // Ensure cursor is in a valid position for next animation
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        this.setCursorPosition(windowWidth * 0.3, windowHeight * 0.3);
        console.log('Cursor position reset to:', this.cursorPosition);
        
        // Generate new grid with the correct time
        this.regenerateGridWithCorrectTime().then(() => {
          // CRITICAL CHANGE: Wait longer for DOM update here too
          console.log('Grid regenerated, waiting for DOM to fully update before selection...');
          setTimeout(() => {
            console.log('Starting next time selection animation cycle');
            this.animateTimeSelection().then(() => {
              this.endAnimation();
              console.log('Animation cycle complete, ready for next minute change');
            }).catch(err => {
              console.error('Error in time selection:', err);
              this.endAnimation();
            });
          }, 1000); // Increase from 0ms to 1000ms (1 second)
        }).catch(err => {
          console.error('Error in grid regeneration:', err);
          this.endAnimation();
        });
      }
    }
  }
  
  private async regenerateGridWithCorrectTime(): Promise<void> {
    console.log('Beginning grid regeneration with correct time');
    
    // Clear any existing GSAP animations on numbers
    this.numbers.forEach(num => {
      gsap.killTweensOf(num);
    });
    
    // Reset all number properties to clear any lingering animations
    this.clearSelections();
    
    // Generate new grid with fresh numbers
    this.initializeGrid();
    
    // Get current time
    const now = new Date();
    const hour = now.getHours() % 12 || 12;
    const minute = now.getMinutes();
    const timeDigits = [
      Math.floor(hour / 10),
      hour % 10,
      Math.floor(minute / 10),
      minute % 10
    ];
    
    console.log(`Verifying grid has correct time: ${hour}:${minute.toString().padStart(2, '0')}`);
    
    // Verify time digits are correctly placed
    if (!this.verifyTimeDigitsInGrid(timeDigits)) {
      console.error('Time digits verification failed after regeneration');
      
      // Try direct manual placement of time digits as a last resort
      const timePatternCells = this.numbers.filter(n => n.isTimePattern);
      if (timePatternCells.length === 4) {
        // Directly assign the correct time digits
        for (let i = 0; i < 4; i++) {
          timePatternCells[i].value = timeDigits[i];
        }
        console.log('Manually assigned time digits to pattern cells');
      } else {
        // If we still can't place the time digits, try one more regeneration
        console.log('Retrying grid regeneration');
        
        // Kill any animations and reinitialize
        this.numbers.forEach(num => {
          gsap.killTweensOf(num);
        });
        this.clearSelections();
        this.initializeGrid();
        
        // Final verification
        if (!this.verifyTimeDigitsInGrid(timeDigits)) {
          console.error('Failed to place time digits after multiple attempts');
        }
      }
    }
    
    // Add subtle floating animation to non-time numbers
    this.numbers.forEach(number => {
      if (!number.isTimePattern) {
        gsap.to(number, {
          y: () => (Math.random() * 10 - 5),
          duration: 2 + Math.random() * 2,
          repeat: -1,
          yoyo: true,
          ease: 'power1.inOut'
        });
      }
    });
    
    console.log('Grid regenerated successfully');
    return Promise.resolve();
  }
  
  private verifyTimeDigitsInGrid(timeDigits: number[]): boolean {
    // Check that all 4 time digits exist and are marked as time pattern
    const timeDigitsInGrid = this.numbers.filter(n => n.isTimePattern).map(n => n.value);
    
    if (timeDigitsInGrid.length !== 4) {
      console.error('Expected 4 time digits but found', timeDigitsInGrid.length);
      return false;
    }
    
    // Check that all required digits are present
    for (const digit of timeDigits) {
      if (!this.numbers.some(n => n.isTimePattern && n.value === digit)) {
        console.error('Time digit', digit, 'not found in grid');
        return false;
      }
    }
    
    // All digits verified
    console.log('All time digits verified in grid:', timeDigits);
    return true;
  }

  // Helper methods for animation state and cursor management
  private beginAnimation(): void {
    this.isAnimating = true;
    this._animationStartTime = Date.now();
    console.log('Animation started at', new Date().toISOString());
  }

  private endAnimation(): void {
    this.isAnimating = false;
    this._animationStartTime = null;
    console.log('Animation ended at', new Date().toISOString());
  }

  private resetAnimationState(): void {
    // Cancel all active GSAP animations related to cursor
    this._cursorTimelines.forEach(timeline => {
      if (timeline.isActive()) {
        timeline.kill();
      }
    });
    this._cursorTimelines = [];
    
    // Kill ALL ongoing animations
    gsap.globalTimeline.clear();
    
    // Reset animation flags
    this.isAnimating = false;
    this._animationStartTime = null;
    
    // Clear all selections
    this.clearSelections();
    
    console.log('Animation state reset');
  }

  private setCursorPosition(x: number, y: number): void {
    // Immediately set position for non-user initiated movements
    this.cursorPosition = { x, y };
    this._lastCursorMove = Date.now();
  }

  private async moveCursorTo(x: number, y: number, duration: number = 1.2, ease: string = "sine.inOut"): Promise<void> {
    // Validate position
    if (isNaN(x) || isNaN(y)) {
      console.warn(`Invalid cursor position (NaN): ${x}, ${y} - using fallback`);
      x = window.innerWidth * 0.3;
      y = window.innerHeight * 0.3;
    }
    
    // Ensure we're moving to an integer pixel position to avoid blurry rendering
    x = Math.round(x);
    y = Math.round(y);
    
    // Get the grid container to validate position is within bounds
    const gridContainer = document.querySelector('.grid-container');
    if (gridContainer) {
      const containerRect = gridContainer.getBoundingClientRect();
      
      // Check if position is outside the viewport or container
      if (x < 0 || y < 0 || 
          x > containerRect.width || y > containerRect.height || 
        x > window.innerWidth || y > window.innerHeight) {
        console.warn(`Invalid cursor position (out of bounds): ${x}, ${y} - using fallback`);
        
        // Use a fallback position that's guaranteed to be within bounds
        x = Math.min(containerRect.width * 0.5, window.innerWidth * 0.3);
        y = Math.min(containerRect.height * 0.5, window.innerHeight * 0.3);
      }
    }
    
    // Calculate distance to the target
    const distanceToTarget = Math.sqrt(
      Math.pow(this.cursorPosition.x - x, 2) + 
      Math.pow(this.cursorPosition.y - y, 2)
    );
    
    // For very small movements, reduce duration to avoid overanimation
    if (distanceToTarget < 10) {
      duration = Math.max(0.3, duration * 0.5);
    }
    
    // For longer movements, ensure duration is long enough for smooth motion
    if (distanceToTarget > 200) {
      duration = Math.max(duration, 1.5);
    }
    
    // Only kill existing animations if we're making a significant movement
    // This prevents the "quick darks" during hover
    if (distanceToTarget > 10) {
      // Small delay before killing existing animations to avoid jitter
      await new Promise(resolve => setTimeout(resolve, 10));
      gsap.killTweensOf(this.cursorPosition);
    }
    
    // Create a promise to track completion
    return new Promise((resolve) => {
      // Create a timeline for more precise control
      const timeline = gsap.timeline({
        onComplete: resolve
      });
      
      // Add the movement animation to the timeline with smoother easing
      timeline.to(this.cursorPosition, {
        x,
        y,
        duration,
        ease, // Default is now sine.inOut for smoother motion
        overwrite: "auto"
      });
      
      // Add curve correction if the distance is significant
      // This gives a more natural feel to longer movements
      if (distanceToTarget > 100) {
        // Add a small curve to the motion for a more natural feel
        const midX = (this.cursorPosition.x + x) / 2 + (Math.random() * 20 - 10);
        const midY = (this.cursorPosition.y + y) / 2 + (Math.random() * 20 - 10);
        
        timeline.clear();
        timeline.to(this.cursorPosition, {
          x: midX,
          y: midY,
          duration: duration * 0.5,
          ease: "sine.in"
        }).to(this.cursorPosition, {
          x,
          y,
          duration: duration * 0.5,
          ease: "sine.out"
        });
      }
      
      // Store the timeline for potential cleanup
      this._cursorTimelines.push(timeline);
      this._lastCursorMove = Date.now();
    });
  }

  private async selectNumber(number: GridNumber) {
    number.isSelected = true;
    number.isHovered = true; // Also set hover state when selecting
    
    // Add click effect with longer duration
    const virtualCursor = document.querySelector('.virtual-cursor');
    if (virtualCursor) {
      virtualCursor.classList.add('selecting');
      setTimeout(() => virtualCursor.classList.remove('selecting'), 800);
    }
    
    // Make the selection more dramatic with slower animation
    await gsap.to(number, {
      scale: 1.5,
      duration: 1.0,
      ease: 'back.out(1.2)'
    });
    
    // Pause longer at the peak of the animation
    await new Promise(resolve => setTimeout(resolve, 400));
    
    await gsap.to(number, {
      scale: 1.2,
      duration: 0.8,
      ease: 'power1.inOut'
    });
  }

  private clearSelections() {
    // Kill any animations first
    this.numbers.forEach(number => {
      gsap.killTweensOf(number);
    });
    
    // Reset all properties
    this.numbers.forEach(number => {
      number.isSelected = false;
      number.isHovered = false;
      number.x = 0;
      number.y = 0;
      number.scale = 1;
      number.opacity = 0.6 + Math.random() * 0.2;
    });
  }

  // Method to calculate and update the hour percentage
  private updateHourPercentage(): void {
    const now = new Date();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    
    // Calculate percentage of current hour (minutes + seconds as fraction of hour)
    this.hourPercentage = Math.round((minutes * 60 + seconds) / 36); // 3600 seconds in hour / 100 for percentage
    
    // Update the time service with the current hour percentage
    this.timeService.updateHourPercentage(this.hourPercentage);
  }

  @HostListener('mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    const gridContainer = document.querySelector('.grid-container');
    if (gridContainer) {
      const rect = gridContainer.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      
      // Don't use direct position setting, use GSAP to smooth the cursor movement
      this.smoothCursorMove(x, y);
    }
  }

  // Add a new method for smoother cursor movement
  private smoothCursorMove(x: number, y: number): void {
    // Calculate distance to the target
    const distanceToTarget = Math.sqrt(
      Math.pow(this.cursorPosition.x - x, 2) + 
      Math.pow(this.cursorPosition.y - y, 2)
    );
    
    // Only kill existing animations if moving a significant distance
    // This prevents jittery movement when the mouse is relatively still
    if (distanceToTarget > 5) {
      gsap.killTweensOf(this.cursorPosition);
      
      // For longer movements, use a smoother, slower animation
      gsap.to(this.cursorPosition, {
        x: Math.round(x),
        y: Math.round(y),
        duration: 0.5,  // Slightly reduced for more responsiveness
        ease: "sine.out", // Much gentler easing function for smoother motion
        overwrite: "auto"
      });
    } else {
      // For tiny movements, keep it extra gentle to avoid jitter
      gsap.to(this.cursorPosition, {
        x: Math.round(x),
        y: Math.round(y),
        duration: 0.3,
        ease: "sine.out",
        overwrite: "auto"
      });
    }
    
    this._lastCursorMove = Date.now();
  }

  private resetEverything(): void {
    console.log('Performing complete reset of application state due to resize');
    
    // First, check if we're in the middle of an animation
    if (this.isAnimating) {
      console.log('Animation in progress - stopping all animations');
      this.endAnimation();
    }
    
    // Kill ALL GSAP animations
    gsap.globalTimeline.clear();
    this._cursorTimelines.forEach(timeline => {
      if (timeline.isActive()) {
        timeline.kill();
      }
    });
    this._cursorTimelines = [];
    
    // Clear all selections and states
    this.clearSelections();
    
    // Reset cursor position based on new window size
    this.setCursorPosition(window.innerWidth * 0.3, window.innerHeight * 0.3);
    
    // Remove any animation overlays that might be stuck
    const overlays = document.querySelectorAll('body > div[style*="z-index: 9999"]');
    overlays.forEach(overlay => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    });
    
    // Reset any number cells visibility
    const numberCells = document.querySelectorAll('.number-cell');
    Array.from(numberCells).forEach(cell => {
      (cell as HTMLElement).style.visibility = '';
    });
    
    // Get current minute to prevent immediate binning
    const now = new Date();
    this.lastCheckedMinute = now.getMinutes();
    
    // Finally, reinitialize the grid with new dimensions
    this.initializeGrid();
    
    // Start with quick initial time selection (without binning) after a delay
    // to give the DOM time to update
    setTimeout(() => {
      console.log('Starting initial time selection after reset');
      this.beginAnimation();
      this.quickInitialTimeSelection().then(() => {
        this.endAnimation();
        console.log('Initial time selection after reset complete');
      }).catch(err => {
        console.error('Error in initial time selection after reset:', err);
        this.endAnimation();
      });
    }, 1000);
  }
} 