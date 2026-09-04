import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { startNearbyRoomCleanup } from "./nearby-cleanup.js";
import { createRuntimeRepositories } from "./runtime.js";

const config = readConfig();
const repositories = createRuntimeRepositories(config);
const app = createApp({ config, repositories });
const stopNearbyRoomCleanup = startNearbyRoomCleanup({ repositories });

const server = app.listen(config.port, () => {
  console.log(`VaultDrop API http://localhost:${config.port} adresinde çalışıyor.`);
  if (!config.databaseUrl) console.warn("Neon bağlantısı yok: geçici geliştirme belleği kullanılıyor.");
});

server.on("close", stopNearbyRoomCleanup);
