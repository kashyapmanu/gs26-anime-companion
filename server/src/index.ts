import { pathToFileURL } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { loadEnv } from "./env.js";

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: true });
  app.get("/health", async () => ({ status: "ok" }));
  return app;
}

async function start() {
  const env = loadEnv();
  const app = buildServer();
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}