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
    /**
     * @param {string} event - Event name
     * @param {(data?: *) => void} callback - Called with the emitted data
     * @returns {() => void} Removes the listener
     */
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
    /**
     * @param {string} event - Event name
     * @param {(data?: *) => void} callback - Listener passed to on()
     */
    off(event, callback) {
      const callbacks = events.get(event);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index !== -1) callbacks.splice(index, 1);
      }
    },
    /**
     * @param {string} event - Event name
     * @param {*} [data] - Passed to each listener
     */
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
