"use strict";
/**
 * Event Bus for pub/sub event handling
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventBus = exports.EngineEvents = exports.EventBus = void 0;
const logger_1 = require("./logger");
/**
 * Event Bus class for handling pub/sub events
 */
class EventBus {
    constructor(maxHistorySize = 100) {
        this.subscriptions = new Map();
        this.eventHistory = [];
        this.maxHistorySize = maxHistorySize;
        this.logger = new logger_1.Logger('EventBus');
        this.subscriptionIdCounter = 0;
    }
    /**
     * Subscribe to an event type
     */
    on(eventType, handler) {
        const id = `sub_${++this.subscriptionIdCounter}`;
        const subscription = {
            id,
            eventType,
            handler,
            once: false,
        };
        if (!this.subscriptions.has(eventType)) {
            this.subscriptions.set(eventType, []);
        }
        this.subscriptions.get(eventType).push(subscription);
        this.logger.debug(`Subscribed to event: ${eventType}`, { subscriptionId: id });
        return id;
    }
    /**
     * Subscribe to an event type once
     */
    once(eventType, handler) {
        const id = `sub_${++this.subscriptionIdCounter}`;
        const subscription = {
            id,
            eventType,
            handler,
            once: true,
        };
        if (!this.subscriptions.has(eventType)) {
            this.subscriptions.set(eventType, []);
        }
        this.subscriptions.get(eventType).push(subscription);
        this.logger.debug(`Subscribed once to event: ${eventType}`, { subscriptionId: id });
        return id;
    }
    /**
     * Unsubscribe from an event
     */
    off(eventType, handler) {
        if (!this.subscriptions.has(eventType)) {
            return;
        }
        if (handler) {
            const subs = this.subscriptions.get(eventType);
            const filtered = subs.filter(s => s.handler !== handler);
            this.subscriptions.set(eventType, filtered);
            this.logger.debug(`Unsubscribed handler from event: ${eventType}`);
        }
        else {
            this.subscriptions.delete(eventType);
            this.logger.debug(`Unsubscribed all handlers from event: ${eventType}`);
        }
    }
    /**
     * Unsubscribe by subscription ID
     */
    offById(subscriptionId) {
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
    emit(eventType, data, source) {
        const event = {
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
        const handlersToRemove = [];
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
            }
            catch (err) {
                this.logger.error(`Error executing event handler`, err, { eventType, subscriptionId: subscription.id });
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
    async emitAsync(eventType, data, source) {
        const event = {
            type: eventType,
            timestamp: Date.now(),
            data,
            source,
        };
        this.addToHistory(event);
        const subs = this.subscriptions.get(eventType) || [];
        const wildcardSubs = this.subscriptions.get('*') || [];
        const allSubs = [...subs, ...wildcardSubs];
        const promises = allSubs.map(async (subscription) => {
            try {
                await subscription.handler(event);
                if (subscription.once) {
                    this.offById(subscription.id);
                }
            }
            catch (err) {
                this.logger.error(`Error in async event handler`, err, { eventType });
            }
        });
        await Promise.all(promises);
    }
    /**
     * Get the number of listeners for an event type
     */
    listenerCount(eventType) {
        const subs = this.subscriptions.get(eventType) || [];
        const wildcardSubs = this.subscriptions.get('*') || [];
        return subs.length + wildcardSubs.length;
    }
    /**
     * Get all registered event types
     */
    getRegisteredEvents() {
        return Array.from(this.subscriptions.keys());
    }
    /**
     * Get event history
     */
    getHistory(limit) {
        if (limit) {
            return this.eventHistory.slice(-limit);
        }
        return [...this.eventHistory];
    }
    /**
     * Clear event history
     */
    clearHistory() {
        this.eventHistory = [];
        this.logger.debug('Event history cleared');
    }
    /**
     * Remove all subscriptions
     */
    removeAllListeners(eventType) {
        if (eventType) {
            this.subscriptions.delete(eventType);
            this.logger.debug(`Removed all listeners for event: ${eventType}`);
        }
        else {
            this.subscriptions.clear();
            this.logger.debug('Removed all event listeners');
        }
    }
    /**
     * Add event to history
     */
    addToHistory(event) {
        this.eventHistory.push(event);
        if (this.eventHistory.length > this.maxHistorySize) {
            this.eventHistory.shift();
        }
    }
}
exports.EventBus = EventBus;
/**
 * Predefined event types for the automation engine
 */
exports.EngineEvents = {
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
};
// Create singleton instance
exports.eventBus = new EventBus();
exports.default = EventBus;
