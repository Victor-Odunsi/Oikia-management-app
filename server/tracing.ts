// Must be imported before any other module (express, pg, http) in both
// entry points — OpenTelemetry's auto-instrumentation patches modules at
// first require/import, so it has to run before those modules load.
//
// Vendor-neutral on purpose: the exact same instrumentation runs whether
// this deploys to the DO droplet or an AWS EC2 instance — only the export
// destination changes, via OTEL_EXPORTER_OTLP_ENDPOINT. With nothing set,
// spans print to stdout instead of silently going nowhere, so there's
// always something to look at even before a real tracing backend exists.
//
// KNOWN LIMITATION: this app is built/run as ESM (package.json "type":
// "module"), and auto-instrumentation's require-in-the-middle hook only
// intercepts CommonJS require() calls, not native ESM import statements.
// Verified via OTEL_LOG_LEVEL=debug: instrumentation-pg patches
// successfully (db.ts loads pg via createRequire, a real CJS require), but
// instrumentation-http/-express never fire (express is loaded via a plain
// top-level `import`) — so only DB query spans are currently captured, not
// HTTP/route spans. Node's ESM loader-hook fix (--experimental-loader or
// module.register with @opentelemetry/instrumentation/hook.mjs) does
// intercept ESM imports, but broke drizzle-orm's named exports in testing
// here and needs more work before it's safe to enable.
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { ConsoleSpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node";

const traceExporter = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  ? new OTLPTraceExporter()
  : new ConsoleSpanExporter();

// SimpleSpanProcessor exports each span as it finishes rather than batching
// — the default BatchSpanProcessor only flushes periodically or on a clean
// shutdown, and this app's traffic is modest enough that per-span export
// overhead doesn't matter; reliable delivery does.
const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME || "oikia-backend",
  spanProcessors: [new SimpleSpanProcessor(traceExporter)],
  instrumentations: [
    getNodeAutoInstrumentations({
      // Fires on every file read/DNS lookup/TCP connect and adds noise
      // without much value here — the meaningful spans for this app are
      // express (route-level) http (request-level) and pg (query-level).
      "@opentelemetry/instrumentation-fs": { enabled: false },
      "@opentelemetry/instrumentation-dns": { enabled: false },
      "@opentelemetry/instrumentation-net": { enabled: false },
    }),
  ],
});

sdk.start();

// Batch or not, an abrupt process exit shouldn't drop in-flight spans.
process.on("SIGTERM", () => {
  sdk.shutdown().finally(() => process.exit(0));
});
