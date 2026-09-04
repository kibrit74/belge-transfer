import { buildVaultDropPackage } from "../transfer/build-vaultdrop-package.js";

function serializeError(error) {
  return {
    code: typeof error?.code === "string" ? error.code : "PACKAGE_FAILED",
    message: typeof error?.message === "string" && error.message
      ? error.message
      : "Paket hazırlanamadı.",
  };
}

export function createVaultDropPackageWorkerMessageHandler(dependencies = {}) {
  const deps = {
    buildVaultDropPackage,
    postMessage: (message) => globalThis.postMessage(message),
    ...dependencies,
  };

  return async function handleMessage(event) {
    const message = event?.data ?? event;
    if (message?.type !== "create" || !Number.isSafeInteger(message.id) || !Array.isArray(message.files)) return;

    const { id, files } = message;

    try {
      const result = await deps.buildVaultDropPackage(files, {
        onProgress: (progress) => {
          deps.postMessage({ type: "progress", id, progress });
        },
      });
      deps.postMessage({ type: "complete", id, result });
    } catch (error) {
      deps.postMessage({ type: "error", id, error: serializeError(error) });
    }
  };
}

if (typeof WorkerGlobalScope !== "undefined"
  && globalThis instanceof WorkerGlobalScope) {
  globalThis.onmessage = createVaultDropPackageWorkerMessageHandler();
}
