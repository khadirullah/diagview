/**
 * Internal Event Bus for DiagView
 * Lightweight pub/sub to decouple modules and avoid circular dependencies.
 */

/**
 * Lightweight Internal Event Bus for DiagView
 * Functional implementation to reduce architectural bloat.
 */
export function EventEmitter() {
  const events = new Map();

  return {
    on(event, callback) {
      if (!events.has(event)) events.set(event, []);
      events.get(event).push(callback);
      // Return a cleanup function so callers can unsubscribe
      return () => {
        const callbacks = events.get(event);
        if (callbacks) {
          const index = callbacks.indexOf(callback);
          if (index !== -1) callbacks.splice(index, 1);
        }
      };
    },
    off(event, callback) {
      const callbacks = events.get(event);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index !== -1) callbacks.splice(index, 1);
      }
    },
    emit(event, data) {
      const callbacks = events.get(event);
      if (callbacks) {
        // Use spread to prevent concurrent modification issues during dispatch
        [...callbacks].forEach((cb) => {
          try {
            cb(data);
          } catch (error) {
            console.error(`DiagView: Error in event listener for "${event}":`, error);
          }
        });
      }
    },
    clear() {
      events.clear();
    },
  };
}
