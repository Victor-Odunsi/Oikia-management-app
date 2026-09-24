import pino from "pino";
import pinoHttp from "pino-http";
import type { Request, Response, NextFunction } from "express";

// Tracing lives in server/tracing.ts (OpenTelemetry, vendor-neutral — must
// be imported before this module or anything else, see that file).

// Structured JSON to stdout. On PM2 (both the DO droplet and this EC2 box),
// stdout only ever lands in PM2's own local log files — nothing ships it
// anywhere on its own. The CloudWatch agent (configured separately, see
// scripts/setup-server.sh) tails those files and forwards them to CloudWatch
// Logs; the JSON shape is what makes the forwarded lines queryable in
// CloudWatch Logs Insights instead of arriving as opaque free text.
export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
});

// Per-request structured log line (method, url, status, duration, request id)
// — the direct replacement for the old ad hoc console.log request logger.
export const httpLogger = pinoHttp({
  logger,
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  autoLogging: {
    ignore: (req) => !req.url?.startsWith("/api"),
  },
});

// Traffic + latency as real CloudWatch metrics via Embedded Metric Format
// (EMF) — a documented JSON shape CloudWatch Logs auto-parses into
// dashboardable/alarmable metrics, no separate metrics backend to run.
// Hand-rolled rather than via the aws-embedded-metrics package: that
// package's environment auto-detection (Lambda/ECS/EC2 probing) proved
// unreliable outside a real detected AWS environment even with an explicit
// override, and EMF itself is just a JSON format — any well-formed line
// works regardless of what emitted it.
function emitEMF(namespace: string, dimensions: Record<string, string>, metrics: Record<string, [number, string]>) {
  const dimensionKeys = Object.keys(dimensions);
  const payload = {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: namespace,
          Dimensions: [dimensionKeys],
          Metrics: Object.entries(metrics).map(([Name, [, MetricUnit]]) => ({ Name, Unit: MetricUnit })),
        },
      ],
    },
    ...dimensions,
    ...Object.fromEntries(Object.entries(metrics).map(([k, [v]]) => [k, v])),
  };
  console.log(JSON.stringify(payload));
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api")) return next();
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    try {
      emitEMF(
        "Oikia/Backend",
        { Route: req.route?.path ?? req.path, Method: req.method },
        {
          RequestCount: [1, "Count"],
          Latency: [durationMs, "Milliseconds"],
          [`Status${Math.floor(res.statusCode / 100)}xx`]: [1, "Count"],
        }
      );
    } catch (err) {
      logger.error({ err }, "failed to record request metrics");
    }
  });
  next();
}
