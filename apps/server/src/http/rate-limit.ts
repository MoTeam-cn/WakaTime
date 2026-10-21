interface Bucket {
  hits: number[];
}

/** 滑动窗口限流，进程内存储（单进程部署足够） */
export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /** 记录一次请求，返回是否超限 */
  hit(key: string): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key) ?? { hits: [] };
    bucket.hits = bucket.hits.filter((t) => now - t < this.windowMs);
    bucket.hits.push(now);
    this.buckets.set(key, bucket);
    return bucket.hits.length > this.limit;
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (bucket.hits.every((t) => now - t >= this.windowMs)) this.buckets.delete(key);
    }
  }
}

