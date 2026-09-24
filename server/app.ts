import { type Server } from "node:http";

import express, {
  type Express,
  type Request,
  Response,
  NextFunction,
} from "express";

import { registerRoutes } from "./routes";
import { logger, httpLogger, metricsMiddleware } from "./observability";

export function log(message: string, source = "express") {
  logger.info({ source }, message);
}

export const app = express();

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}

app.use(httpLogger);
app.use(metricsMiddleware);

app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

export default async function runApp(
  setup: (app: Express, server: Server) => Promise<void>,
) {
  const server = await registerRoutes(app);

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ success: false, error: "FileTooLarge", message: "File exceeds the 10MB upload limit." });
      return;
    }

    const status = err.status || err.statusCode || 500;
    logger.error({ err, method: req.method, path: req.path }, "unhandled request error");

    if (req.path.startsWith("/api")) {
      res.status(status).json({ success: false, error: "InternalError", message: "An unexpected error occurred." });
      return;
    }

    res.status(status).json({ message: err.message || "Internal Server Error" });
  });

  // importantly run the final setup after setting up all the other routes so
  // the catch-all route doesn't interfere with the other routes
  await setup(app, server);

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
  }, () => {
    log(`serving on port ${port}`);
  });
}
