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
  isGridReady = false; // Used to control visibility
  
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
  private _binnedPositions: Set<number> = new Set<number>();
  private _isResetting = false;  // Add flag to prevent multiple resets
  private _resetTimeout: any;    // Track reset timeout
  private _visibilityTimeout: any;  // Track visibility timeout
  private _lastVisibilityChange = 0;  // Track last visibility change

  constructor(
    private timeService: TimeService,
    private responsiveService: ResponsiveService
  ) {}

  ngOnInit() {
    console.log('=== Grid Initial Load Start ===');
    // Set grid as not ready initially
    this.isGridReady = false;
    
    // Do initial setup
    this.setDynamicGridSize();
    this.initializeGrid();
    console.log('=== Grid Initial Load Complete ===');
    
    // Force a layout recalculation after a delay 
    setTimeout(() => {
      console.log('Optimizing grid layout');
      this.resetEverything();
      
      // Show the grid with the optimized layout
      setTimeout(() => {
        this.isGridReady = true;
        console.log('Grid is now visible with optimized layout');
      }, 50);
    }, 200);
    
    // FALLBACK: Ensure grid becomes visible no matter what
    setTimeout(() => {
      if (!this.isGridReady) {
        console.log('Fallback: Forcing grid to visible state');
        this.isGridReady = true;
      }
    }, 1000);
    
    // Add resize event listener with moderate debounce
    this.resizeSubscription = fromEvent(window, 'resize')
      .pipe(debounceTime(250)) // Reduced debounce for better responsiveness
      .subscribe(() => {
        console.log('Window resize detected - resetting everything');
        // Force a reflow by accessing offsetHeight
        const container = document.querySelector('.grid-container');
        if (container) {
          container.clientHeight; // Force reflow
        }
        this.resetEverything();
      });
    
    // Add visibility change listener to detect tab switching
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    console.log('Added visibility change listener for tab switching');
    
    // Get current minute for tracking changes
    const now = new Date();
    this.lastCheckedMinute = now.getMinutes();
    console.log(`Initial minute set to: ${this.lastCheckedMinute}`);
    
    // Initialize hour percentage
    this.updateHourPercentage();
    
    // Initialize cursor position to a valid location
    this.setCursorPosition(window.innerWidth * 0.3, window.innerHeight * 0.3);
    
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
  }

  ngOnDestroy() {
    if (this.timeSelectionTimeout) {
      clearTimeout(this.timeSelectionTimeout);
    }
    if (this.timeDisplayTimeout) {
      clearTimeout(this.timeDisplayTimeout);
    }
    if (this._resetTimeout) {
      clearTimeout(this._resetTimeout);
    }
    if (this._visibilityTimeout) {
      clearTimeout(this._visibilityTimeout);
    }
    
    // Clean up resize subscription
    if (this.resizeSubscription) {
      this.resizeSubscription.unsubscribe();
      this.resizeSubscription = null;
    }
    
    // Remove visibility change listener
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    
    // Ensure all GSAP animations are cleaned up
    gsap.globalTimeline.clear();
  }
  
  // Handle tab visibility changes
  private handleVisibilityChange = (): void => {
    if (!document.hidden) {
      // Debounce visibility changes
      const now = Date.now();
      if (now - this._lastVisibilityChange < 1000) {
        console.log('Debouncing visibility change');
        return;
      }
      this._lastVisibilityChange = now;

      // Clear any pending visibility timeouts
      if (this._visibilityTimeout) {
        clearTimeout(this._visibilityTimeout);
      }
      
      // Tab has become visible again
      console.log('Tab visibility changed to visible - resetting everything');
      
      // Handle any animations that might have been in progress
      if (this.isAnimating) {
        this.endAnimation();
      }
      
      // Schedule reset with a slight delay to ensure proper cleanup
      this._visibilityTimeout = setTimeout(() => {
        this.resetEverything();
      }, 100);
    }
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

  // New method to calculate and set dynamic grid dimensions
  private setDynamicGridSize(): void {
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const aspectRatio = screenWidth / screenHeight;
    
    console.log('=== Grid Size Calculation Start ===');
    console.log(`Window dimensions: ${screenWidth}x${screenHeight}, ratio: ${aspectRatio}`);
    
    // Get current screen size
    const currentScreenSize = this.responsiveService.getCurrentScreenSize();
    console.log(`Responsive service screen size: ${currentScreenSize}`);
    
    // Get the grid container to analyze its dimensions
    const gridContainer = document.querySelector('.grid-container');
    
    // Get more precise dimensions using getBoundingClientRect
    let containerWidth = screenWidth;
    let availableWidth = screenWidth;
    let containerHeight = screenHeight;
    
    if (gridContainer) {
      const containerRect = gridContainer.getBoundingClientRect();
      const containerStyles = getComputedStyle(gridContainer);
      containerWidth = containerRect.width;
      containerHeight = containerRect.height;
      
      // Calculate available space accounting for padding
      const containerPaddingLeft = parseFloat(containerStyles.paddingLeft) || 0;
      const containerPaddingRight = parseFloat(containerStyles.paddingRight) || 0;
      const containerPaddingTop = parseFloat(containerStyles.paddingTop) || 0;
      const containerPaddingBottom = parseFloat(containerStyles.paddingBottom) || 0;
      
      availableWidth = containerWidth - containerPaddingLeft - containerPaddingRight;
      const availableHeight = containerHeight - containerPaddingTop - containerPaddingBottom;
      
      console.log('Available space:', {
        width: availableWidth,
        height: availableHeight
      });
    }
    
    // Get a sample cell to measure actual dimensions
    const sampleCell = document.querySelector('.number-cell');
    let cellWidth = 30; // Default fallback
    let cellMargin = 2; // Default fallback
    let horizontalGap = 8; // Default fallback
    
    if (sampleCell) {
      const cellStyles = getComputedStyle(sampleCell);
      const cellRect = sampleCell.getBoundingClientRect();
      cellWidth = cellRect.width;
      cellMargin = parseFloat(cellStyles.marginLeft) + parseFloat(cellStyles.marginRight);
      
      // Get grid gap
      const grid = document.querySelector('.number-grid');
      if (grid) {
        const gridStyles = getComputedStyle(grid);
        horizontalGap = parseFloat(gridStyles.columnGap) || horizontalGap;
      }
    }
    
    // Calculate total width needed per cell
    const totalCellWidth = cellWidth + cellMargin + horizontalGap;
    
    // Calculate maximum columns that can fit
    let maxColumns = Math.floor(availableWidth / totalCellWidth);
    
    // Adjust columns based on screen size and aspect ratio
    let columns: number;
    if (aspectRatio > 2.2) { // Super ultrawide
      columns = Math.min(maxColumns, 20);
    } else if (aspectRatio > 1.8) { // Standard ultrawide
      columns = Math.min(maxColumns, 18);
    } else if (currentScreenSize === 'xs') {
      columns = Math.min(maxColumns, 6);
    } else if (currentScreenSize === 'sm') {
      columns = Math.min(maxColumns, 8);
    } else if (currentScreenSize === 'md') {
      columns = Math.min(maxColumns, 12);
    } else {
      columns = Math.min(maxColumns, 15);
    }
    
    // Ensure minimum columns
    columns = Math.max(5, columns);
    
    // Set the grid columns style
    this.gridColumns = `repeat(${columns}, 1fr)`;
    console.log(`Final grid columns: ${columns} (max possible: ${maxColumns})`);
    console.log('=== Grid Size Calculation End ===');
  }

  private initializeGrid(): void {
    // Kill any existing animations on numbers
    if (this.numbers.length > 0) {
      this.numbers.forEach(num => {
        gsap.killTweensOf(num);
      });
    }
    
    // Ensure we have a clean grid container
    const existingGrids = document.querySelectorAll('.grid-container');
    if (existingGrids.length === 0) {
      console.warn('No grid container found, one will be created by the template');
    } else if (existingGrids.length > 1) {
      console.warn(`Multiple grid containers found (${existingGrids.length}), cleaning up`);
      Array.from(existingGrids).slice(1).forEach(grid => {
        if (grid.parentNode) {
          grid.parentNode.removeChild(grid);
        }
      });
    }
    
    // CRITICAL FIX: Reset binned positions when generating a new grid
    this._binnedPositions = new Set<number>();
    console.log('Reset binned positions during grid initialization');
    
    const match = this.gridColumns.match(/\d+/);
    if (!match) return;
    
    const columns = parseInt(match[0]);
    
    // Calculate rows based on container height, available space, and device characteristics
    const gridContainer = document.querySelector('.grid-container');
    if (!gridContainer) {
      console.warn('Grid container not found, aborting grid initialization');
      return;
    }
    
    // Get precise container dimensions using getBoundingClientRect for accuracy
    const containerRect = gridContainer.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;
    
    // Validate container dimensions
    if (containerWidth <= 0 || containerHeight <= 0) {
      console.warn(`Invalid container dimensions: ${containerWidth}x${containerHeight}, using fallback values`);
      return;
    }
    
    // Get number grid element to measure its padding and gap
    const numberGrid = document.querySelector('.number-grid');
    if (!numberGrid) {
      console.warn('Number grid not found, using default values');
    }
    
    // Get computed styles to accurately account for padding, borders and gaps
    const gridStyles = numberGrid ? getComputedStyle(numberGrid) : null;
    const containerStyles = getComputedStyle(gridContainer);
    
    // Extract padding values from computed styles
    const gridPaddingTop = gridStyles ? parseFloat(gridStyles.paddingTop) : 4;
    const gridPaddingRight = gridStyles ? parseFloat(gridStyles.paddingRight) : 4;
    const gridPaddingBottom = gridStyles ? parseFloat(gridStyles.paddingBottom) : 4;
    const gridPaddingLeft = gridStyles ? parseFloat(gridStyles.paddingLeft) : 4;
    
    const containerPaddingTop = parseFloat(containerStyles.paddingTop);
    const containerPaddingRight = parseFloat(containerStyles.paddingRight);
    const containerPaddingBottom = parseFloat(containerStyles.paddingBottom);
    const containerPaddingLeft = parseFloat(containerStyles.paddingLeft);
    
    // Calculate the total padding of container and grid
    const totalHorizontalPadding = containerPaddingLeft + containerPaddingRight + gridPaddingLeft + gridPaddingRight;
    const totalVerticalPadding = containerPaddingTop + containerPaddingBottom + gridPaddingTop + gridPaddingBottom;
    
    // Calculate the available space inside the grid (excluding padding)
    const availableWidth = containerWidth - totalHorizontalPadding;
    const availableHeight = containerHeight - totalVerticalPadding;
    
    console.log(`Container dimensions: ${containerWidth}x${containerHeight}px (available: ${availableWidth}x${availableHeight}px)`);
    console.log(`Total padding: horizontal=${totalHorizontalPadding}px, vertical=${totalVerticalPadding}px`);
    
    // Get current screen size and its aspect ratio
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const aspectRatio = screenWidth / screenHeight;
    const currentScreenSize = this.responsiveService.getCurrentScreenSize();
    
    // Get gap value from computed styles or fall back to calculated values
    let horizontalGap = gridStyles && gridStyles.columnGap ? parseFloat(gridStyles.columnGap) : 8;
    let verticalGap = gridStyles && gridStyles.rowGap ? parseFloat(gridStyles.rowGap) : 8;
    
    if (isNaN(horizontalGap) || horizontalGap <= 0) {
      // Fallback if we couldn't get a valid gap value
      horizontalGap = currentScreenSize === 'xs' ? 6 : 8;
    }
    
    if (isNaN(verticalGap) || verticalGap <= 0) {
      // Fallback and calculation based on device characteristics (as before)
      if (currentScreenSize === 'xs' && aspectRatio < 0.6) {
        verticalGap = Math.min(6, screenHeight * 0.007);
      } else if (aspectRatio > 1.8) { // Ultrawide
        // Use smaller gaps for ultrawides to fit more content
        verticalGap = Math.min(7, screenHeight * 0.01);
      } else {
        verticalGap = Math.min(8, screenHeight * 0.01);
      }
    }
    
    console.log(`Grid gaps: horizontal=${horizontalGap}px, vertical=${verticalGap}px`);
    
    // Get cell dimensions with accurate margin calculation
    // First try to get an existing cell to measure
    const sampleCell = document.querySelector('.number-cell');
    let cellWidth, cellHeight, cellMarginH, cellMarginV;
    
    if (sampleCell) {
      const cellStyles = getComputedStyle(sampleCell);
      const cellRect = sampleCell.getBoundingClientRect();
      cellWidth = cellRect.width;
      cellHeight = cellRect.height;
      cellMarginH = parseFloat(cellStyles.marginLeft) + parseFloat(cellStyles.marginRight);
      cellMarginV = parseFloat(cellStyles.marginTop) + parseFloat(cellStyles.marginBottom);
    } else {
      // If no sample cell exists, use calculated values based on screen size
      // For ultrawides, we want smaller cells to fit more content
      if (aspectRatio > 2.2) { // Super ultrawide (32:9)
        cellWidth = cellHeight = Math.min(24, screenWidth * 0.015);
      } else if (aspectRatio > 1.8) { // Standard ultrawide (21:9)
        cellWidth = cellHeight = Math.min(26, screenWidth * 0.018);
      } else if (currentScreenSize === 'xs') {
        if (aspectRatio < 0.5) {
          cellWidth = cellHeight = Math.min(36, screenWidth * 0.07);
        } else if (aspectRatio < 0.65) {
          cellWidth = cellHeight = Math.min(38, screenWidth * 0.075);
        } else {
          cellWidth = cellHeight = Math.min(40, screenWidth * 0.08);
        }
      } else if (currentScreenSize === 'sm') {
        cellWidth = cellHeight = Math.min(35, screenWidth * 0.06); 
      } else if (currentScreenSize === 'md') {
        cellWidth = cellHeight = Math.min(32, screenWidth * 0.04);
      } else {
        cellWidth = cellHeight = Math.min(30, screenWidth * 0.03);
      }
      
      // Default margin values if we couldn't measure
      cellMarginH = 4; // 2px on each side
      cellMarginV = 4; // 2px on each side
    }
    
    console.log(`Cell dimensions: ${cellWidth}x${cellHeight}px (margins: horizontal=${cellMarginH}px, vertical=${cellMarginV}px)`);
    
    // Calculate total cell width and height including margins
    const totalCellWidth = cellWidth + cellMarginH + horizontalGap;
    const totalCellHeight = cellHeight + cellMarginV + verticalGap;
    
    // Calculate precisely how many columns can fit (we already have a columns value from gridColumns)
    const calculatedColumns = Math.floor(availableWidth / totalCellWidth);
    
    // If our calculated columns differ significantly from our set columns, log a warning
    if (Math.abs(calculatedColumns - columns) > 2) {
      console.warn(`Column mismatch: set=${columns}, calculated=${calculatedColumns} (diff=${calculatedColumns - columns})`);
    }
    
    // Calculate precisely how many rows can fit
    const calculatedRows = Math.floor(availableHeight / totalCellHeight);
    console.log(`Precisely calculated rows that can fit: ${calculatedRows} (for cells of height ${totalCellHeight}px)`);
    
    // Apply aspect ratio adjustments to max rows (similar to before)
    let maxRows: number;
    
    // Optimal grid cell count - total number of cells should be proportional to screen size
    const optimalCellCount = Math.min(500, Math.floor(screenWidth * screenHeight / 4000));
    
    if (aspectRatio > 2.2) { // Super ultrawide (32:9)
      // For super ultrawides, allow much more rows - only limit by what fits in the container
      maxRows = calculatedRows;
    } else if (aspectRatio > 1.8) { // Standard ultrawide (21:9)
      // For standard ultrawides, also allow more rows to fill the space
      maxRows = calculatedRows;
    } else if (currentScreenSize === 'xs') {
      if (aspectRatio < 0.5) {
        // For extremely tall phones, use almost all available rows
        maxRows = calculatedRows;
      } else if (aspectRatio < 0.65) {
        maxRows = Math.min(calculatedRows, 18);
      } else {
        maxRows = Math.min(calculatedRows, 12);
      }
    } else if (currentScreenSize === 'sm') {
      if (aspectRatio < 0.7) {
        maxRows = Math.min(calculatedRows, 16);
      } else if (aspectRatio < 0.9) {
        maxRows = Math.min(calculatedRows, 14);
      } else {
        maxRows = Math.min(calculatedRows, 12);
      }
    } else if (currentScreenSize === 'md') {
      maxRows = aspectRatio < 1.3 ? Math.min(calculatedRows, 18) : Math.min(calculatedRows, 16);
    } else {
      maxRows = aspectRatio < 1.6 ? Math.min(calculatedRows, 22) : Math.min(calculatedRows, 20);
    }
    
    // Ensure a minimum number of rows for visual appeal
    maxRows = Math.max(8, maxRows);
    
    // Use precise calculation for rows, with minimum for visual consistency
    const rows = Math.max(8, Math.min(calculatedRows, maxRows));
    
    // Calculate total cells
    const totalCells = rows * columns;
    
    console.log(`Aspect ratio: ${aspectRatio.toFixed(2)}, Cell size: ${cellWidth.toFixed(1)}x${cellHeight.toFixed(1)}px`);
    console.log(`Grid dimensions: ${columns} columns x ${rows} rows = ${totalCells} cells (max: ${maxRows} rows, calculated: ${calculatedRows})`);
    console.log(`Optimal cell count for screen size: ${optimalCellCount}`);
    
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

    // Set all numbers to their final positions immediately
    this.numbers.forEach((number, index) => {
      // Set to final state immediately - no entrance animation
      number.y = 0;       // Final Y position
      number.x = 0;       // Final X position
      number.opacity = number.isTimePattern ? 0.7 : 0.6 + Math.random() * 0.2; // Final opacity
      number.scale = 1;   // Final scale
    });
    
    // Skip entrance animation and just add floating animation
    this.numbers.forEach(number => {
      // Only add floating animation to non-time pattern numbers
      if (!number.isTimePattern) {
        gsap.to(number, {
          y: () => (Math.random() * 6 - 3),
          duration: 2 + Math.random() * 2,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut'
        });
      }
    });
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
      
      // NOTE: Moved this line to after the cursor movement
      // this.numbers[cellIndex].isHovered = true;
      
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
      
      // FIXED: Only set hover state AFTER cursor has reached the position
      this.numbers[cellIndex].isHovered = true;
      
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
    
    // IMPORTANT: Don't hide the numbers immediately - we want to see them during the animation
    // We'll add them to _binnedPositions after animation completes
    
    // Kill ALL ongoing animations
    gsap.globalTimeline.clear();
    
    // Tell TimeService which bin we're targeting
    const binIndex = this.timeService.binTime();
    
    return new Promise<void>((resolve) => {
      // Critical safety timeout - ensures animation never gets stuck
      const mainSafetyTimeout = setTimeout(() => {
        console.warn('CRITICAL SAFETY TIMEOUT - Animation took too long, forcing cleanup');
        
        // Even on timeout, we should still track the binned positions
        selectedIndices.forEach(idx => {
          this._binnedPositions.add(idx);
          
          // Set opacity in the model to 0, but don't hide DOM elements permanently
          if (idx < this.numbers.length) {
            this.numbers[idx].opacity = 0;
          }
        });
        
        this.clearSelections();
        this.endAnimation(); // Ensure animation state is reset
        
        // Remove any stray animation overlay elements that might have been left behind
        const overlays = document.querySelectorAll('body > div[style*="z-index: 9999"]');
        overlays.forEach(overlay => {
          if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
          }
        });
        
        resolve();
      }, 10000); // 10 seconds absolute maximum for animation
      
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
            
            // NOW is when we update the _binnedPositions 
            // after the animation has finished
            selectedIndices.forEach(idx => {
              // Track which positions are binned
              this._binnedPositions.add(idx);
              
              // Update the opacity in the model, but don't permanently hide DOM elements
              if (idx < this.numbers.length) {
                this.numbers[idx].opacity = 0;
              }
            });
            
            console.log(`Added ${selectedIndices.length} positions to binned set after animation, total: ${this._binnedPositions.size}`);
            
            // Wait a very short moment before cleanup to ensure animation visibility
            setTimeout(() => {
              console.log('Animation complete, removing overlay');
              
              // Remove the animation overlay
              if (document.body.contains(animationOverlay)) {
                document.body.removeChild(animationOverlay);
                console.log('Animation overlay removed');
              }
              
              // Clear the main safety timeout since we're done
              clearTimeout(mainSafetyTimeout);
              
              // Resolve promise
              resolve();
            }, 100);
          }
        });
        
        // For each clone, create a unique animation path
        clones.forEach((clone, index) => {
          // Calculate unique timing offsets for each number (slight stagger)
          const timeOffset = index * 0.05;
          
          // Get random direction vector for initial subtle movement
          const angle = Math.random() * Math.PI * 2;
          const distance = 5 + Math.random() * 10; // Small random distance
          const offsetX = Math.cos(angle) * distance;
          const offsetY = Math.sin(angle) * distance;
          
          // Step 1: Subtle hover with a slight fading glow effect
          tl.to(clone, {
            boxShadow: '0 0 15px rgba(0, 255, 255, 0.7)',
            textShadow: '0 0 15px rgba(0, 255, 255, 0.8)',
            x: offsetX,
            y: offsetY,
            scale: 1.1,
            duration: 0.9,
            ease: "sine.inOut",
            delay: timeOffset
          }, 0); // Start at the same time with staggered delays
          
          // Step 2: Fading distortion effect before moving to bin
          tl.to(clone, {
            opacity: 0.9,
            letterSpacing: '0.1em',
            scale: 1.0,
            filter: 'blur(1px)',
            duration: 0.7,
            ease: "power1.in"
          }, 0.7 + timeOffset);
          
          // Step 3: Move toward bin with trailing effect
          tl.to(clone, {
            left: binFixedX + (Math.random() * 10 - 5), // Slight variation in final positions
            top: binFixedY,
            opacity: 0,
            scale: 0.7,
            filter: 'blur(2px)',
            duration: 1.2,
            ease: "power2.inOut"
          }, 1.4 + timeOffset);
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
            
            // Mark as binned to ensure they don't reappear
            selectedIndices.forEach(idx => {
              this._binnedPositions.add(idx);
              
              // Update both model and DOM
              if (idx < this.numbers.length) {
                this.numbers[idx].opacity = 0;
              }
            });
            
            clearTimeout(mainSafetyTimeout);
            resolve();
          }
        }, 5000);
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
        
        this.clearSelections();
        clearTimeout(mainSafetyTimeout);
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
    // Get the current numbers that were visible before bins
    const oldNumbers = [...this.numbers];
    const oldNumberCells = document.querySelectorAll('.number-cell');
    
    // Update our binned positions tracking by checking just the models, not the DOM
    // This way we're tracking which positions/indices are binned, not which DOM elements
    oldNumbers.forEach((num, index) => {
      // If a number has zero opacity, consider it binned
      if (num.opacity === 0) {
        this._binnedPositions.add(index);
      }
    });
    
    console.log(`Tracking ${this._binnedPositions.size} binned positions that will stay hidden in model`);
    
    // Only clone visible cells for the transition
    const visibleOldNumbers = Array.from(oldNumberCells).filter((cell, index) => 
      !this._binnedPositions.has(index)
    );
    
    // Clear any existing GSAP animations on numbers
    gsap.killTweensOf(this.numbers);
    
    // Take a snapshot of visible elements for animation
    const numberClones: {element: HTMLElement, rect: DOMRect}[] = [];
    
    visibleOldNumbers.forEach(element => {
      const rect = element.getBoundingClientRect();
      numberClones.push({
        element: element as HTMLElement,
        rect: rect
      });
    });
    
    console.log(`Created ${numberClones.length} clones for transition animation`);
    
    // Initialize new grid
    this.initializeGrid();
    
    // *** CRITICAL: Set the opacity of the binned positions to 0 in the new model ***
    // This prevents them from showing up during transitions, but allows DOM elements to be reused
    this._binnedPositions.forEach(index => {
      if (index < this.numbers.length) {
        this.numbers[index].opacity = 0;
      }
    });
    
    // Remove duplicate declaration and code
    // const visibleOldNumbers = Array.from(oldNumberCells).filter((cell, index) => 
    //  !this._binnedPositions.has(index)
    // );
    
    // Clear any existing GSAP animations on numbers
    this.numbers.forEach(num => {
      gsap.killTweensOf(num);
    });
    
    // Reset all number properties to clear any lingering animations
    this.clearSelections();
    
    // SEVERANCE-STYLE TRANSITION: Create a "data refinement" effect
    // --------------------------------------------------------------
    // First capture the current state of the grid to create a seamless transition
    const gridContainer = document.querySelector('.grid-container') as HTMLElement;
    if (gridContainer) {
      // Create a snapshot overlay for the transition effect
      const transitionOverlay = document.createElement('div');
      transitionOverlay.className = 'severance-transition-overlay';
      transitionOverlay.style.position = 'absolute';
      transitionOverlay.style.top = '0';
      transitionOverlay.style.left = '0';
      transitionOverlay.style.width = '100%';
      transitionOverlay.style.height = '100%';
      transitionOverlay.style.pointerEvents = 'none';
      transitionOverlay.style.zIndex = '5000';
      transitionOverlay.style.opacity = '1';
      transitionOverlay.style.background = 'transparent';
      
      // Only clone cells that were visible (not already binned)
      visibleOldNumbers.forEach(cell => {
        const rect = cell.getBoundingClientRect();
        const gridRect = gridContainer.getBoundingClientRect();
        
        // Position relative to grid container
        const clone = cell.cloneNode(true) as HTMLElement;
        clone.style.position = 'absolute';
        clone.style.left = `${rect.left - gridRect.left}px`;
        clone.style.top = `${rect.top - gridRect.top}px`;
        clone.style.width = `${rect.width}px`;
        clone.style.height = `${rect.height}px`;
        clone.style.pointerEvents = 'none';
        clone.style.transition = 'none';
        
        transitionOverlay.appendChild(clone);
      });
      
      // Add the overlay to the grid container
      gridContainer.appendChild(transitionOverlay);
      
      // Create a brief "severance" effect with scan lines
      const scanLines = document.createElement('div');
      scanLines.className = 'severance-scan-lines';
      scanLines.style.position = 'absolute';
      scanLines.style.top = '0';
      scanLines.style.left = '0';
      scanLines.style.width = '100%';
      scanLines.style.height = '100%';
      scanLines.style.backgroundImage = 'linear-gradient(transparent 50%, rgba(0, 255, 255, 0.03) 50%)';
      scanLines.style.backgroundSize = '100% 4px';
      scanLines.style.pointerEvents = 'none';
      scanLines.style.zIndex = '5001';
      scanLines.style.opacity = '0';
      
      gridContainer.appendChild(scanLines);
      
      // Create a "data processing" line
      const dataLine = document.createElement('div');
      dataLine.className = 'severance-data-line';
      dataLine.style.position = 'absolute';
      dataLine.style.left = '0';
      dataLine.style.top = '0';
      dataLine.style.width = '100%';
      dataLine.style.height = '2px';
      dataLine.style.backgroundColor = 'rgba(0, 255, 255, 0.6)';
      dataLine.style.boxShadow = '0 0 10px rgba(0, 255, 255, 0.8)';
      dataLine.style.zIndex = '5002';
      dataLine.style.transform = 'translateY(-10px)';
      
      gridContainer.appendChild(dataLine);
      
      // Animate the transition
      const tl = gsap.timeline({
        onComplete: () => {
          // Remove transition elements when animation is complete
          gridContainer.removeChild(transitionOverlay);
          gridContainer.removeChild(scanLines);
          gridContainer.removeChild(dataLine);
        }
      });
      
      // Step 1: Show scan lines and start data processing
      tl.to(scanLines, {
        opacity: 0.9,
        duration: 0.3,
        ease: 'power1.in'
      });
      
      // Step 2: Animate the data processing line downward
      tl.to(dataLine, {
        top: '100%',
        duration: 1.3,
        ease: 'power1.inOut'
      }, 0.1);
      
      // Step 3: Fade out the old numbers with a digital distortion effect
      const clones = transitionOverlay.querySelectorAll('.number-cell');
      clones.forEach((clone, i) => {
        // Create a staggered, glitchy fade out
        const delay = 0.1 + (i % 10) * 0.02;
        
        tl.to(clone, {
          opacity: 0,
          filter: 'blur(2px)',
          y: '+=' + (Math.random() * 2 - 1),
          x: '+=' + (Math.random() * 2 - 1),
          scale: 0.9,
          duration: 0.4,
          ease: 'power1.in',
          delay: delay
        }, 0.3);
      });
      
      // Step 4: Fade out scan lines
      tl.to(scanLines, {
        opacity: 0,
        duration: 0.3,
        ease: 'power1.out'
      }, 1.2);
    }
    
    // Generate new grid with fresh numbers
    this.initializeGrid();
    
    // CRITICAL FIX: Immediately hide binned positions right after grid initialization
    // This ensures they never appear even for a split second
    if (this._binnedPositions.size > 0) {
      console.log(`Immediately updating opacity for ${this._binnedPositions.size} binned numbers in new grid`);
      
      this._binnedPositions.forEach(pos => {
        if (pos < this.numbers.length) {
          // Update only the model, not the DOM visibility
          this.numbers[pos].opacity = 0;
        }
      });
    }
    
    // CRITICAL FIX: Update binned positions in the model, but don't hide DOM elements
    // This ensures they are tracked as binned but can be reused with new values
    if (this._binnedPositions.size > 0) {
      console.log(`Setting opacity to 0 for ${this._binnedPositions.size} binned positions in model`);
      
      this._binnedPositions.forEach(pos => {
        if (pos < this.numbers.length) {
          // Update only the model, not the DOM, so elements can be reused
          this.numbers[pos].opacity = 0;
        }
      });
    }
    
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
    
    // Apply model updates for binned numbers after animation
    setTimeout(() => {
      // Hide numbers in the model that were previously binned
      if (this._binnedPositions.size > 0) {
        console.log(`Setting opacity to 0 for ${this._binnedPositions.size} previously binned positions in model`);
        this._binnedPositions.forEach(pos => {
          // Only update the model to ensure cells can be reused with new values
          if (this.numbers[pos]) {
            this.numbers[pos].opacity = 0;
          }
        });
      }
    }, 0);
    
    // Improved entry animations for all numbers
    this.numbers.forEach((number, idx) => {
      // CRITICAL FIX: Double-check binned positions before animation
      // This ensures binned numbers never get animated into view
      if (this._binnedPositions.has(idx)) {
        // Set opacity to 0 in the model but don't change DOM visibility
        number.opacity = 0;
        return; // Skip animation entirely
      }
      
      // INSTANT APPEARANCE - No gradual animations
      // Set all properties to their final values immediately
      number.opacity = 0.7; // Final opacity
      number.scale = 1;     // Final scale
      number.y = 0;         // Final position
      
      // Only add the subtle floating animation for non-time pattern numbers
      if (!number.isTimePattern) {
        gsap.to(number, {
          y: () => (Math.random() * 6 - 3),
          duration: 2 + Math.random() * 2,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut'
        });
      }
    });
    
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
    // FIXED: Removed premature hover state setting
    // number.isHovered = true; // Also set hover state when selecting
    
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
    
    // NOW set the hover state once animation has started
    number.isHovered = true;
    
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
    console.log('=== Grid Reset Start ===');
    const gridContainer = document.querySelector('.grid-container');
    
    if (gridContainer) {
      const beforeStyles = getComputedStyle(gridContainer);
      console.log('Container before reset:', {
        height: beforeStyles.height,
        width: beforeStyles.width,
        rect: gridContainer.getBoundingClientRect()
      });
    }
    
    // Briefly hide grid during reset if it's already been shown
    const wasReady = this.isGridReady;
    if (wasReady) {
      this.isGridReady = false;
    }
    
    this.setDynamicGridSize();
    
    if (gridContainer) {
      const afterSizeStyles = getComputedStyle(gridContainer);
      console.log('Container after size calc:', {
        height: afterSizeStyles.height,
        width: afterSizeStyles.width,
        rect: gridContainer.getBoundingClientRect()
      });
    }
    
    this.initializeGrid();
    
    if (gridContainer) {
      const finalStyles = getComputedStyle(gridContainer);
      console.log('Container after init:', {
        height: finalStyles.height,
        width: finalStyles.width,
        rect: gridContainer.getBoundingClientRect()
      });
    }
    
    // Restore grid visibility after reset if it was previously visible
    if (wasReady) {
      setTimeout(() => {
        this.isGridReady = true;
      }, 50);
    }
    
    console.log('=== Grid Reset Complete ===');
  }
} 