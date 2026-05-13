import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

export class JobQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    this.concurrency = options.concurrency || 1;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.handlers = new Map();
    this.queue = [];
    this.processing = new Set();
    this.stats = { completed: 0, failed: 0, total: 0 };
  }

  add(type, data) {
    const jobId = uuidv4();
    const job = {
      id: jobId,
      type,
      data,
      status: 'pending',
      attempts: 0,
      maxAttempts: this.retryAttempts,
      createdAt: new Date().toISOString(),
    };
    this.queue.push(job);
    this.stats.total++;
    this.emit('job:added', { jobId, type });
    setImmediate(() => this.processNext());
    return jobId;
  }

  on(type, handler) {
    if (typeof handler !== 'function') throw new Error('Handler must be a function');
    this.handlers.set(type, handler);
    return this;
  }

  async processNext() {
    if (this.processing.size >= this.concurrency || this.queue.length === 0) return;

    const job = this.queue.shift();
    job.status = 'processing';
    this.processing.add(job.id);

    try {
      const handler = this.handlers.get(job.type);
      if (!handler) throw new Error(`No handler registered for job type: ${job.type}`);
      const result = await handler(job);
      job.status = 'completed';
      this.stats.completed++;
      this.processing.delete(job.id);
      this.emit('job:complete', { jobId: job.id, type: job.type, result });
    } catch (error) {
      job.attempts++;
      if (job.attempts < job.maxAttempts) {
        const delay = this.retryDelay * Math.pow(2, job.attempts - 1);
        job.status = 'pending';
        this.processing.delete(job.id);
        setTimeout(() => {
          this.queue.push(job);
          this.processNext();
        }, delay);
        this.emit('job:retrying', { jobId: job.id, type: job.type, attempt: job.attempts, delay });
      } else {
        job.status = 'failed';
        job.error = error.message;
        this.stats.failed++;
        this.processing.delete(job.id);
        this.emit('job:failed', { jobId: job.id, type: job.type, error: error.message });
      }
    }

    setImmediate(() => this.processNext());

    if (this.processing.size === 0 && this.queue.length === 0) {
      this.emit('queue:drain', { timestamp: new Date().toISOString() });
    }
  }

  getStats() {
    return {
      pending: this.queue.length,
      processing: this.processing.size,
      completed: this.stats.completed,
      failed: this.stats.failed,
      total: this.stats.total,
    };
  }
}

export const defaultQueue = new JobQueue({ concurrency: 1 });
