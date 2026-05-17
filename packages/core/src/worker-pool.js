import os from "node:os";
import { Worker } from "node:worker_threads";

export class WorkerPool {
  constructor(workerFile, options = {}) {
    this.workerFile = workerFile;
    this.size = options.size ?? Math.min(os.cpus().length, 8);
    this.workerData = options.workerData ?? {};
    this.onStateChange = options.onStateChange ?? (() => {});

    this.workers = [];
    this.idleWorkers = [];
    this.queue = [];
    this.jobs = new Map();
    this.nextJobId = 1;
    this.closed = false;

    for (let i = 0; i < this.size; i++) {
      this.createWorker();
    }

    this.emitState();
  }

  get busyCount() {
    return this.jobs.size;
  }

  get idleCount() {
    return this.idleWorkers.length;
  }

  emitState() {
    this.onStateChange({
      totalWorkers: this.size,
      busyWorkers: this.busyCount,
      idleWorkers: this.idleCount,
      queuedJobs: this.queue.length,
    });
  }

  createWorker() {
    const worker = new Worker(this.workerFile, {
      workerData: this.workerData,
    });

    worker.on("message", (message) => {
      const job = this.jobs.get(message.id);
      if (!job) return;

      this.jobs.delete(message.id);

      if (message.type === "done") {
        job.resolve(message.result);
      } else {
        job.reject(new Error(message.error || "Worker failed"));
      }

      this.idleWorkers.push(worker);
      this.emitState();
      this.dispatch();
    });

    worker.on("error", (error) => {
      for (const [id, job] of this.jobs) {
        if (job.worker === worker) {
          this.jobs.delete(id);
          job.reject(error);
        }
      }

      this.workers = this.workers.filter((item) => item !== worker);
      this.idleWorkers = this.idleWorkers.filter((item) => item !== worker);

      if (!this.closed) this.createWorker();

      this.emitState();
      this.dispatch();
    });

    worker.on("exit", (code) => {
      this.workers = this.workers.filter((item) => item !== worker);
      this.idleWorkers = this.idleWorkers.filter((item) => item !== worker);

      if (!this.closed && code !== 0) this.createWorker();

      this.emitState();
    });

    this.workers.push(worker);
    this.idleWorkers.push(worker);
  }

  run(payload) {
    if (this.closed) {
      return Promise.reject(new Error("WorkerPool is closed"));
    }

    const id = this.nextJobId++;

    return new Promise((resolve, reject) => {
      this.queue.push({ id, payload, resolve, reject });
      this.emitState();
      this.dispatch();
    });
  }

  dispatch() {
    while (this.queue.length > 0 && this.idleWorkers.length > 0) {
      const worker = this.idleWorkers.pop();
      const job = this.queue.shift();

      this.jobs.set(job.id, { ...job, worker });

      worker.postMessage({
        type: "scan",
        id: job.id,
        ...job.payload,
      });
    }

    this.emitState();
  }

  async close() {
    this.closed = true;

    await Promise.allSettled(
      this.workers.map((worker) => worker.terminate()),
    );
  }
}
