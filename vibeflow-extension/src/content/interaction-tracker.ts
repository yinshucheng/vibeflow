/**
 * Content Script: Interaction Tracker
 * 
 * Tracks user interactions within web pages and reports them to the service worker.
 * Requirements: 5.7, 5.11
 */

type InteractionType = 'click' | 'input' | 'scroll' | 'keypress' | 'video_play' | 'video_pause';

// Configuration
const SCROLL_DEBOUNCE_MS = 250;
const INTERACTION_BATCH_INTERVAL_MS = 5000;
const MAX_BATCH_SIZE = 50;

// Interaction data to be sent to service worker
interface InteractionData {
  type: InteractionType;
  timestamp: number;
  target?: string;
  data?: Record<string, unknown>;
}

// Scroll tracking state
interface ScrollState {
  maxDepth: number;
  lastReportedDepth: number;
  scrollTimeout: ReturnType<typeof setTimeout> | null;
}

// Media tracking state
interface MediaState {
  isPlaying: boolean;
  element: HTMLMediaElement | null;
}

class InteractionTracker {
  private interactions: InteractionData[] = [];
  private scrollState: ScrollState = {
    maxDepth: 0,
    lastReportedDepth: 0,
    scrollTimeout: null,
  };
  private mediaState: MediaState = {
    isPlaying: false,
    element: null,
  };
  private batchTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;
  private tabId: number | null = null;

  /**
   * Initialize the interaction tracker
   */
  initialize(): void {
    if (this.initialized) return;

    this.setupEventListeners();
    this.startBatchTimer();
    this.observeMediaElements();
    
    // Get tab ID from service worker
    this.getTabId();

    this.initialized = true;
    console.log('[InteractionTracker] Initialized');
  }

  /**
   * Get the current tab ID from the service worker
   */
  private async getTabId(): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_TAB_ID' });
      if (response?.tabId) {
        this.tabId = response.tabId;
      }
    } catch (error) {
      console.error('[InteractionTracker] Failed to get tab ID:', error);
    }
  }

  /**
   * Setup event listeners for user interactions
   * Requirements: 5.7
   */
  private setupEventListeners(): void {
    // Click events
    document.addEventListener('click', this.handleClick.bind(this), { passive: true, capture: true });

    // Scroll events (debounced)
    document.addEventListener('scroll', this.handleScroll.bind(this), { passive: true });
    window.addEventListener('scroll', this.handleScroll.bind(this), { passive: true });

    // Input events
    document.addEventListener('input', this.handleInput.bind(this), { passive: true, capture: true });

    // Keypress events (for general activity detection)
    document.addEventListener('keydown', this.handleKeypress.bind(this), { passive: true, capture: true });

    // Visibility change (for focus tracking)
    document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));

    // Page unload
    window.addEventListener('beforeunload', this.handleUnload.bind(this));
  }

  /**
   * Handle click events
   */
  private handleClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const targetSelector = this.getElementSelector(target);

    this.recordInteraction('click', targetSelector);
  }

  /**
   * Handle scroll events with debouncing
   * Requirements: 5.6
   */
  private handleScroll(): void {
    // Calculate scroll depth
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = document.documentElement.clientHeight;
    
    // Avoid division by zero
    const scrollableHeight = scrollHeight - clientHeight;
    const depth = scrollableHeight > 0 
      ? Math.round((scrollTop / scrollableHeight) * 100)
      : 0;

    // Update max depth
    this.scrollState.maxDepth = Math.max(this.scrollState.maxDepth, depth);

    // Debounce scroll depth reporting
    if (this.scrollState.scrollTimeout) {
      clearTimeout(this.scrollState.scrollTimeout);
    }

    this.scrollState.scrollTimeout = setTimeout(() => {
      // Only report if depth changed significantly (5% threshold)
      if (Math.abs(this.scrollState.maxDepth - this.scrollState.lastReportedDepth) >= 5) {
        this.reportScrollDepth(this.scrollState.maxDepth);
        this.scrollState.lastReportedDepth = this.scrollState.maxDepth;
      }
    }, SCROLL_DEBOUNCE_MS);

    // Record scroll interaction
    this.recordInteraction('scroll', undefined, { depth });
  }

  /**
   * Handle input events
   */
  private handleInput(event: Event): void {
    const target = event.target as HTMLElement;
    const targetSelector = this.getElementSelector(target);
    const inputType = (target as HTMLInputElement).type || 'text';

    this.recordInteraction('input', targetSelector, { inputType });
  }

  /**
   * Handle keypress events
   */
  private handleKeypress(event: KeyboardEvent): void {
    // Don't record individual keys for privacy, just the fact that there was keyboard activity
    // Throttle keypress recording to avoid flooding
    const now = Date.now();
    const lastKeypress = this.interactions.filter(i => i.type === 'keypress').pop();
    
    if (!lastKeypress || now - lastKeypress.timestamp > 1000) {
      this.recordInteraction('keypress');
    }
  }

  /**
   * Handle visibility change
   */
  private handleVisibilityChange(): void {
    if (document.hidden) {
      // Page became hidden - flush interactions
      this.flushInteractions();
    }
  }

  /**
   * Handle page unload
   */
  private handleUnload(): void {
    this.flushInteractions();
  }

  /**
   * Observe media elements for play/pause events
   * Requirements: 5.11
   */
  private observeMediaElements(): void {
    // Initial scan for media elements
    this.scanForMediaElements();

    // Use MutationObserver to detect dynamically added media elements
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLMediaElement) {
            this.attachMediaListeners(node);
          } else if (node instanceof HTMLElement) {
            // Check for media elements within added nodes
            const mediaElements = node.querySelectorAll('video, audio');
            mediaElements.forEach(el => this.attachMediaListeners(el as HTMLMediaElement));
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * Scan document for existing media elements
   */
  private scanForMediaElements(): void {
    const mediaElements = document.querySelectorAll('video, audio');
    mediaElements.forEach(el => this.attachMediaListeners(el as HTMLMediaElement));
  }

  /**
   * Attach play/pause listeners to a media element
   */
  private attachMediaListeners(element: HTMLMediaElement): void {
    // Avoid duplicate listeners
    if ((element as HTMLMediaElement & { _vibeflowTracked?: boolean })._vibeflowTracked) {
      return;
    }
    (element as HTMLMediaElement & { _vibeflowTracked?: boolean })._vibeflowTracked = true;

    element.addEventListener('play', () => {
      this.handleMediaPlay(element);
    });

    element.addEventListener('pause', () => {
      this.handleMediaPause(element);
    });

    element.addEventListener('ended', () => {
      this.handleMediaPause(element);
    });

    // Check if already playing
    if (!element.paused) {
      this.handleMediaPlay(element);
    }
  }

  /**
   * Handle media play event
   */
  private handleMediaPlay(element: HTMLMediaElement): void {
    this.mediaState.isPlaying = true;
    this.mediaState.element = element;

    this.recordInteraction('video_play', this.getElementSelector(element), {
      mediaType: element.tagName.toLowerCase(),
      src: element.currentSrc || element.src,
    });

    // Notify service worker
    this.reportMediaState(true);
  }

  /**
   * Handle media pause event
   */
  private handleMediaPause(element: HTMLMediaElement): void {
    if (this.mediaState.element === element) {
      this.mediaState.isPlaying = false;
      this.mediaState.element = null;

      this.recordInteraction('video_pause', this.getElementSelector(element), {
        mediaType: element.tagName.toLowerCase(),
      });

      // Notify service worker
      this.reportMediaState(false);
    }
  }

  /**
   * Record an interaction
   */
  private recordInteraction(
    type: InteractionType,
    target?: string,
    data?: Record<string, unknown>
  ): void {
    const interaction: InteractionData = {
      type,
      timestamp: Date.now(),
      target,
      data,
    };

    this.interactions.push(interaction);

    // Flush if batch is full
    if (this.interactions.length >= MAX_BATCH_SIZE) {
      this.flushInteractions();
    }
  }

  /**
   * Get a CSS selector for an element
   */
  private getElementSelector(element: HTMLElement): string {
    if (!element) return 'unknown';

    // Try to get a meaningful selector
    if (element.id) {
      return `#${element.id}`;
    }

    if (element.className && typeof element.className === 'string') {
      const classes = element.className.split(' ').filter(c => c).slice(0, 2);
      if (classes.length > 0) {
        return `${element.tagName.toLowerCase()}.${classes.join('.')}`;
      }
    }

    return element.tagName.toLowerCase();
  }

  /**
   * Start the batch timer for periodic flushing
   */
  private startBatchTimer(): void {
    if (this.batchTimer) return;

    this.batchTimer = setInterval(() => {
      this.flushInteractions();
    }, INTERACTION_BATCH_INTERVAL_MS);
  }

  /**
   * Stop the batch timer
   */
  private stopBatchTimer(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
  }

  /**
   * Flush interactions to service worker
   */
  private async flushInteractions(): Promise<void> {
    if (this.interactions.length === 0) return;

    const interactionsToSend = [...this.interactions];
    this.interactions = [];

    try {
      await chrome.runtime.sendMessage({
        type: 'INTERACTIONS_BATCH',
        payload: {
          interactions: interactionsToSend,
          scrollDepth: this.scrollState.maxDepth,
        },
      });
    } catch (error) {
      // Service worker might not be ready, re-queue interactions
      console.error('[InteractionTracker] Failed to send interactions:', error);
      this.interactions = [...interactionsToSend, ...this.interactions].slice(0, MAX_BATCH_SIZE * 2);
    }
  }

  /**
   * Report scroll depth to service worker
   */
  private async reportScrollDepth(depth: number): Promise<void> {
    try {
      await chrome.runtime.sendMessage({
        type: 'SCROLL_DEPTH_UPDATE',
        payload: { depth },
      });
    } catch (error) {
      console.error('[InteractionTracker] Failed to report scroll depth:', error);
    }
  }

  /**
   * Report media state to service worker
   */
  private async reportMediaState(isPlaying: boolean): Promise<void> {
    try {
      await chrome.runtime.sendMessage({
        type: 'MEDIA_STATE_UPDATE',
        payload: { isPlaying },
      });
    } catch (error) {
      console.error('[InteractionTracker] Failed to report media state:', error);
    }
  }

  /**
   * Cleanup and destroy the tracker
   */
  destroy(): void {
    this.stopBatchTimer();
    this.flushInteractions();
    this.initialized = false;
  }
}

// Create and initialize the tracker
const interactionTracker = new InteractionTracker();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    interactionTracker.initialize();
  });
} else {
  interactionTracker.initialize();
}

