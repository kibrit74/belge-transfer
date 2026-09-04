import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("qrcode", () => ({
  default: {
    create: vi.fn(() => ({
      modules: { size: 21, get: vi.fn(() => false) },
    })),
  },
}));

import { decryptContainer, encryptFile } from "../crypto/encrypted-container.js";
import { createFountainEncoder } from "../optical/fountain.js";
import { encodeFrameV4 } from "../optical/frame-v4.js";
import { readFileAsArrayBuffer } from "../protocol/hash.js";
import { createQrVideo } from "../video/create-qr-video.js";
import { decodeQrVideo } from "../video/decode-qr-video.js";

describe("optik aktarım ağ yalıtımı", () => {
  let originalCreateElement;
  let originalMediaRecorder;
  let originalSendBeacon;
  let originalWebSocket;
  let fetchSpy;
  let xhrOpenSpy;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ağ yasak"));
    xhrOpenSpy = vi.spyOn(XMLHttpRequest.prototype, "open");
    originalSendBeacon = navigator.sendBeacon;
    Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: vi.fn() });
    originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = vi.fn();

    originalMediaRecorder = globalThis.MediaRecorder;
    globalThis.MediaRecorder = mediaRecorderMock();
    originalCreateElement = document.createElement.bind(document);
    document.createElement = vi.fn((tagName) => {
      const element = originalCreateElement(tagName);
      if (tagName === "canvas") {
        element.getContext = vi.fn(() => ({
          fillStyle: "",
          imageSmoothingEnabled: true,
          fillRect: vi.fn(),
          drawImage: vi.fn(),
          createImageData: vi.fn((width, height) => ({
            data: new Uint8ClampedArray(width * height * 4),
          })),
          putImageData: vi.fn(),
        }));
        element.captureStream = vi.fn(() => ({ getTracks: () => [] }));
      }
      return element;
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    xhrOpenSpy.mockRestore();
    document.createElement = originalCreateElement;
    globalThis.MediaRecorder = originalMediaRecorder;
    globalThis.WebSocket = originalWebSocket;
    Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: originalSendBeacon });
  });

  it("şifreleme, video üretimi, çözümleme ve BTA açma sırasında içerik ağına çıkmaz", async () => {
    const file = new File(["yerel gizli içerik"], "belge.txt", { type: "text/plain" });
    await createQrVideo(file, { profileId: "compatible" });

    const encrypted = await encryptFile(file);
    const encryptedBytes = new Uint8Array(await readFileAsArrayBuffer(encrypted.blob));
    const encoder = await createFountainEncoder(encryptedBytes, {
      transferId: encrypted.transferId,
      blockBytes: 700,
      emissionRatio: 1.5,
    });
    const frames = encoder.symbols().map((symbol) => encodeFrameV4(encoder.metadata, symbol));
    const recovered = await decodeQrVideo(new File(["video"], "aktarim.webm"), {}, undefined, {
      frameTexts: frames,
    });
    const opened = await decryptContainer(recovered, encrypted.keyText);

    expect(await opened.file.text()).toBe("yerel gizli içerik");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrOpenSpy).not.toHaveBeenCalled();
    expect(navigator.sendBeacon).not.toHaveBeenCalled();
    expect(globalThis.WebSocket).not.toHaveBeenCalled();
  });
});

function mediaRecorderMock() {
  return class MediaRecorderMock {
    static isTypeSupported(type) { return type === "video/webm"; }
    constructor(_stream, options) {
      this.mimeType = options.mimeType;
      this.state = "inactive";
    }
    start() {
      this.state = "recording";
      setTimeout(() => this.ondataavailable?.({ data: new Blob(["video"], { type: this.mimeType }) }), 0);
    }
    stop() {
      this.state = "inactive";
      setTimeout(() => this.onstop?.(), 0);
    }
  };
}
