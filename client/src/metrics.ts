import { writeFile } from "fs/promises";
import { performance } from "perf_hooks";

export type LabelValue = string | number;
export type Labels = Record<string, LabelValue>;

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

  filter(labels: Labels): MetricsValues {
    return new MetricsValues(
      this.values.filter((value) => {
        for (const key in labels) {
          if (value.labels[key] !== labels[key]) {
            return false;
          }
        }
        return true;
      })
    );
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

  filter(labels: Labels): MetricsValues {
    return new MetricsValues(this.storage).filter(labels);
  }

  async dump(file: string) {
    try {
      await writeFile(file, JSON.stringify(this.storage));
    } catch (e) {
      console.error("Failed to dump metrics:", e);
    }
  }
}
