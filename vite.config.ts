import { defineConfig, type Plugin } from "vitest/config";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";
import { createHub, type Hub } from "./src/device/hub";

/**
 * Mounts the device hub (simulated firmware + relay) at ws://<host>/hub on
 * both the dev and preview servers, and prints the URL to open on a phone.
 */
function deviceHub(): Plugin {
  let hub: Hub | null = null;
  const pin = process.env.SAFELOCK_PIN ?? "1234";
  const attach = (server: { httpServer: import("node:http").Server | import("node:http2").Http2SecureServer | null; config: { logger: { info(m: string): void; warn(m: string): void } } }, port: number) => {
    hub = createHub({ pin });
    server.httpServer?.on("upgrade", (req, socket, head) => {
      if (req.url?.split("?")[0] === "/hub") hub!.handleUpgrade(req, socket, head);
    });
    server.httpServer?.on("close", () => hub?.close());
    const lan = Object.values(networkInterfaces()).flat().filter((n) => n && n.family === "IPv4" && !n.internal).map((n) => n!.address);
    const log = server.config.logger;
    log.info(`\n  Safe Lock device hub: simulated firmware at /hub`);
    for (const ip of lan) log.info(`  Phone screen:  http://${ip}:${port}/mobile.html`);
    if (!process.env.SAFELOCK_PIN) log.warn(`  Using the default unlock PIN 1234. Set SAFELOCK_PIN to change it.\n`);
  };
  return {
    name: "safelock-device-hub",
    configureServer(server) {
      if (process.env.VITEST) return; // unit tests start their own hub
      attach(server, server.config.server.port ?? 5180);
    },
    configurePreviewServer(server) {
      attach(server, server.config.preview.port ?? 4173);
    },
  };
}

export default defineConfig({
  plugins: [deviceHub()],
  server: { port: 5180, strictPort: true, host: true },
  preview: { port: 4173, strictPort: true, host: true },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 2000,
    rollupOptions: { input: { main: resolve(__dirname, "index.html"), mobile: resolve(__dirname, "mobile.html") } },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
