/**
 * Event Bus for pub/sub event handling
 */

import { Logger } from './logger';

export type EventHandler = (event: Event) => void | Promise<void>;

export interface Event {
  type: string;
  timestamp: number;
  data?: unknown;
  source?: string;
}

export interface EventSubscription {
  id: string;
  eventType: string;
  handler: EventHandler;
  once: boolean;
}

/**
 * Event Bus class for handling pub/sub events
 */
export class EventBus {
  private subscriptions: Map<string, EventSubscription[]>;
  private eventHistory: Event[];
  private maxHistorySize: number;
  private logger: Logger;
  private subscriptionIdCounter: number;

  constructor(maxHistorySize: number = 100) {
    this.subscriptions = new Map();
    this.eventHistory = [];
    this.maxHistorySize = maxHistorySize;
    this.logger = new Logger('EventBus');
    this.subscriptionIdCounter = 0;
  }

  /**
   * Subscribe to an event type
   */
  on(eventType: string, handler: EventHandler): string {
    const id = `sub_${++this.subscriptionIdCounter}`;
    const subscription: EventSubscription = {
      id,
      eventType,
      handler,
      once: false,
    };

    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, []);
    }
    this.subscriptions.get(eventType)!.push(subscription);

    this.logger.debug(`Subscribed to event: ${eventType}`, { subscriptionId: id });
    return id;
  }

  /**
   * Subscribe to an event type once
   */
  once(eventType: string, handler: EventHandler): string {
    const id = `sub_${++this.subscriptionIdCounter}`;
    const subscription: EventSubscription = {
      id,
      eventType,
      handler,
      once: true,
    };

    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, []);
    }
    this.subscriptions.get(eventType)!.push(subscription);

    this.logger.debug(`Subscribed once to event: ${eventType}`, { subscriptionId: id });
    return id;
  }

  /**
   * Unsubscribe from an event
   */
  off(eventType: string, handler?: EventHandler): void {
    if (!this.subscriptions.has(eventType)) {
      return;
    }

    if (handler) {
      const subs = this.subscriptions.get(eventType)!;
      const filtered = subs.filter(s => s.handler !== handler);
      this.subscriptions.set(eventType, filtered);
      this.logger.debug(`Unsubscribed handler from event: ${eventType}`);
    } else {
      this.subscriptions.delete(eventType);
      this.logger.debug(`Unsubscribed all handlers from event: ${eventType}`);
    }
  }

  /**
   * Unsubscribe by subscription ID
   */
  offById(subscriptionId: string): boolean {
    for (const [eventType, subs] of this.subscriptions.entries()) {
      const index = subs.findIndex(s => s.id === subscriptionId);
      if (index !== -1) {
        subs.splice(index, 1);
        this.logger.debug(`Unsubscribed by ID: ${subscriptionId}`);
        return true;
      }
    }
    return false;
  }

  /**
   * Emit an event synchronously
   */
  emit(eventType: string, data?: unknown, source?: string): void {
    const event: Event = {
      type: eventType,
      timestamp: Date.now(),
      data,
      source,
    };

    // Add to history
    this.addToHistory(event);

    this.logger.debug(`Emitting event: ${eventType}`, { data });

    // Get subscriptions for this event type
    const subs = this.subscriptions.get(eventType) || [];

    // Also check for wildcard subscriptions
    const wildcardSubs = this.subscriptions.get('*') || [];

    const allSubs = [...subs, ...wildcardSubs];

    // Process subscriptions
    const handlersToRemove: string[] = [];

    for (const subscription of allSubs) {
      try {
        const result = subscription.handler(event);
        if (result instanceof Promise) {
          result.catch(err => {
            this.logger.error(`Error in event handler`, err, { eventType, subscriptionId: subscription.id });
          });
        }

        // Remove one-time subscriptions after execution
        if (subscription.once) {
          handlersToRemove.push(subscription.id);
        }
      } catch (err) {
        this.logger.error(`Error executing event handler`, err as Error, { eventType, subscriptionId: subscription.id });
      }
    }

    // Remove one-time subscriptions
    for (const id of handlersToRemove) {
      this.offById(id);
    }
  }

  /**
   * Emit an event asynchronously
   */
  async emitAsync(eventType: string, data?: unknown, source?: string): Promise<void> {
    const event: Event = {
      type: eventType,
      timestamp: Date.now(),
      data,
      source,
    };

    this.addToHistory(event);

    const subs = this.subscriptions.get(eventType) || [];
    const wildcardSubs = this.subscriptions.get('*') || [];
    const allSubs = [...subs, ...wildcardSubs];

    const promises = allSubs.map(async subscription => {
      try {
        await subscription.handler(event);
        if (subscription.once) {
          this.offById(subscription.id);
        }
      } catch (err) {
        this.logger.error(`Error in async event handler`, err as Error, { eventType });
      }
    });

    await Promise.all(promises);
  }

  /**
   * Get the number of listeners for an event type
   */
  listenerCount(eventType: string): number {
    const subs = this.subscriptions.get(eventType) || [];
    const wildcardSubs = this.subscriptions.get('*') || [];
    return subs.length + wildcardSubs.length;
  }

  /**
   * Get all registered event types
   */
  getRegisteredEvents(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  /**
   * Get event history
   */
  getHistory(limit?: number): Event[] {
    if (limit) {
      return this.eventHistory.slice(-limit);
    }
    return [...this.eventHistory];
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
    this.logger.debug('Event history cleared');
  }

  /**
   * Remove all subscriptions
   */
  removeAllListeners(eventType?: string): void {
    if (eventType) {
      this.subscriptions.delete(eventType);
      this.logger.debug(`Removed all listeners for event: ${eventType}`);
    } else {
      this.subscriptions.clear();
      this.logger.debug('Removed all event listeners');
    }
  }

  /**
   * Add event to history
   */
  private addToHistory(event: Event): void {
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }
}

/**
 * Predefined event types for the automation engine
 */
export const EngineEvents = {
  // Template events
  TEMPLATE_LOADED: 'template:loaded',
  TEMPLATE_VALIDATED: 'template:validated',
  TEMPLATE_ERROR: 'template:error',

  // Execution events
  EXECUTION_START: 'execution:start',
  EXECUTION_PROGRESS: 'execution:progress',
  EXECUTION_COMPLETE: 'execution:complete',
  EXECUTION_ERROR: 'execution:error',
  EXECUTION_PAUSED: 'execution:paused',
  EXECUTION_RESUMED: 'execution:resumed',
  EXECUTION_CANCELLED: 'execution:cancelled',

  // Node events
  NODE_START: 'node:start',
  NODE_COMPLETE: 'node:complete',
  NODE_ERROR: 'node:error',
  NODE_SKIPPED: 'node:skipped',

  // Validation events
  VALIDATION_START: 'validation:start',
  VALIDATION_COMPLETE: 'validation:complete',
  VALIDATION_ERROR: 'validation:error',

  // Browser events
  BROWSER_LAUNCH: 'browser:launch',
  BROWSER_CLOSE: 'browser:close',
  BROWSER_ERROR: 'browser:error',
  BROWSER_RECONNECTED: 'browser:reconnected',

  // Provider events
  PROVIDER_LOADED: 'provider:loaded',
  PROVIDER_ERROR: 'provider:error',
  SESSION_EXPIRED: 'provider:session_expired',
  SESSION_REFRESHED: 'provider:session_refreshed',

  // Action events
  ACTION_START: 'action:start',
  ACTION_COMPLETE: 'action:complete',
  ACTION_ERROR: 'action:error',
} as const;

export type EngineEventType = typeof EngineEvents[keyof typeof EngineEvents];

// Create singleton instance
export const eventBus = new EventBus();

export default EventBus;
