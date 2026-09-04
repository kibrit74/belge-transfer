import jsQR from "jsqr";

self.onmessage = (event) => {
  const message = event.data;
  if (!message || message.type !== "decode") return;

  try {
    const { imageData } = message;
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "attemptBoth",
    });

    if (code?.data) {
      self.postMessage({ type: "decoded", text: code.data });
    } else {
      self.postMessage({ type: "empty" });
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "QR karesi çözülemedi.",
    });
  }
};
