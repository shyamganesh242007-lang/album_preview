/**
 * Performance measurement utility for development logging
 */
const IS_DEV = process.env.NODE_ENV !== 'production';

export const perfLogger = {
  mark(label: string): number {
    if (!IS_DEV) return 0;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return now;
  },

  measure(label: string, startMs: number, extraDetails?: Record<string, unknown>) {
    if (!IS_DEV) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const duration = Math.round(now - startMs);
    const detailsStr = extraDetails ? ` | ${JSON.stringify(extraDetails)}` : '';
    console.log(`⏱️ [PERF] ${label}: ${duration}ms${detailsStr}`);
  },

  log(label: string, details?: Record<string, unknown>) {
    if (!IS_DEV) return;
    const detailsStr = details ? ` | ${JSON.stringify(details)}` : '';
    console.log(`🚀 [PERF] ${label}${detailsStr}`);
  },
};
