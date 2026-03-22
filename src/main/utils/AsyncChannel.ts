/**
 * AsyncChannel - An async iterable queue for multi-turn SDK communication.
 *
 * Acts as a bridge between imperative push-based code and the SDK's
 * pull-based AsyncIterable<SDKUserMessage> prompt interface.
 *
 * When the SDK's streamInput() reads from this channel:
 * - If messages are queued, they are yielded immediately.
 * - If the queue is empty, next() blocks until a message is pushed or the channel is closed.
 *
 * This keeps the SDK subprocess alive between user turns, allowing
 * background task notifications to flow naturally.
 */

import logger from './logger';

export class AsyncChannel<T> implements AsyncIterable<T> {
  private queue: T[] = [];
  private resolve: ((value: IteratorResult<T>) => void) | null = null;
  private closed = false;

  /**
   * Push a value into the channel.
   * If a consumer is waiting (blocked on next()), it is resolved immediately.
   * If no consumer is waiting, the value is queued.
   */
  push(value: T): void {
    if (this.closed) {
      logger.warn('AsyncChannel: push called on closed channel, ignoring');
      return;
    }

    if (this.resolve) {
      // A consumer is waiting — resolve it immediately
      const resolve = this.resolve;
      this.resolve = null;
      resolve({ value, done: false });
    } else {
      // No consumer waiting — queue the value
      this.queue.push(value);
    }
  }

  /**
   * Close the channel. Any waiting consumer gets { done: true }.
   * Subsequent calls to push() are ignored.
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;

    if (this.resolve) {
      const resolve = this.resolve;
      this.resolve = null;
      resolve({ value: undefined as unknown as T, done: true });
    }
  }

  /**
   * Check if the channel is closed.
   */
  isClosed(): boolean {
    return this.closed;
  }

  /**
   * Implement AsyncIterable protocol.
   */
  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        // If there are queued values, yield immediately
        if (this.queue.length > 0) {
          return Promise.resolve({ value: this.queue.shift()!, done: false });
        }

        // If channel is closed and queue is empty, we're done
        if (this.closed) {
          return Promise.resolve({ value: undefined as unknown as T, done: true });
        }

        // Otherwise, block until a value is pushed or channel is closed
        return new Promise<IteratorResult<T>>((resolve) => {
          this.resolve = resolve;
        });
      },
    };
  }
}
