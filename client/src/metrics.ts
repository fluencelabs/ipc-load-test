import { writeFile } from "fs/promises";
import { performance } from "perf_hooks";

export type LabelKey = string | number;
export type LabelValue = string | number | Labels;
export type Labels = {
  [key: LabelKey]: LabelValue;
};

export interface MetricValue {
  labels: Labels;
  start: number;
  duration: number;
}

export class MetricsValues {
  private readonly values: MetricValue[] = [];

  constructor(values: MetricValue[]) {
    this.values = values;
  }

  filter(predicates: {
    [k: LabelKey]: (v: LabelValue) => boolean;
  }): MetricsValues {
    return new MetricsValues(
      this.values.filter((value) => {
        for (const [k, p] of Object.entries(predicates)) {
          const v = value.labels[k];
          if (!v || !p(v)) {
            return false;
          }
        }
        return true;
      })
    );
  }

  gather<T>(key: LabelKey, f: (v: LabelValue) => T | undefined): T[] {
    const result: T[] = [];

    this.values.forEach((value) => {
      const v = value.labels[key];
      if (v) {
        const mapped = f(v);
        if (mapped) {
          result.push(mapped);
        }
      }
    });

    return result;
  }

  count() {
    return this.values.length;
  }

  map<T>(f: (_: MetricValue) => T): T[] {
    return this.values.map(f);
  }
}

export class Metrics {
  private storage: MetricValue[] = [];

  start(labels: Labels) {
    const now = performance.now();
    return (additional: Labels = {}) => {
      const end = performance.now();
      this.storage.push({
        labels: { ...labels, ...additional },
        start: now,
        duration: end - now,
      });
    };
  }

  filter(predicates: {
    [k: LabelKey]: (v: LabelValue) => boolean;
  }): MetricsValues {
    return new MetricsValues(this.storage).filter(predicates);
  }

  gather<T>(key: LabelKey, f: (v: LabelValue) => T): T[] {
    return new MetricsValues(this.storage).gather(key, f);
  }

  async dump(file: string) {
    try {
      await writeFile(file, JSON.stringify(this.storage));
    } catch (e) {
      console.error("Failed to dump metrics:", e);
    }
  }
}
