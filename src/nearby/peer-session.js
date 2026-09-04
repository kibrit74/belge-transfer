import { deriveVerificationPhrase } from "./verification-phrase.js";

export function createNearbyPeerSession({
  role,
  code,
  token,
  signaling,
  peerFactory = defaultPeerFactory,
  readyHandshake = confirmNearbyChannelReady,
  closeTimeoutMs = 1_000,
} = {}) {
  if (!new Set(["host", "guest"]).has(role)) throw new TypeError("Cihaz rolü geçersiz.");
  const listeners = new Set();
  let peer = null;
  let channel = null;
  let operationController = null;
  let signalingController = null;
  let localSdp = null;
  let remoteSdp = null;
  let sequence = 0;
  let closed = false;
  let roomClosed = false;
  let roomClosePromise = null;

  function emit(state) {
    for (const listener of listeners) listener(state);
  }

  async function closeSignalingRoom() {
    if (roomClosed) return;
    if (roomClosePromise) return roomClosePromise;
    roomClosePromise = (async () => {
      try {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const controller = new AbortController();
          try {
            await withTimeout(
              signaling.close?.({ code, token, signal: controller.signal, timeoutMs: closeTimeoutMs }),
              closeTimeoutMs,
              () => controller.abort("timeout"),
            );
            roomClosed = true;
            return;
          } catch {
            // Geçici ağ hatasında aynı idempotent DELETE en fazla bir kez yeniden denenir.
          } finally {
            controller.abort("cleanup");
          }
        }
      } finally {
        roomClosePromise = null;
      }
    })();
    return roomClosePromise;
  }

  async function cleanup({ closeRoom = false } = {}) {
    if (!closed) {
      closed = true;
      operationController?.abort();
      signalingController?.abort();
      channel?.close?.();
      peer?.close?.();
    }
    if (closeRoom) await closeSignalingRoom();
  }

  return {
    async connect({ signal, timeoutMs = 15_000 } = {}) {
      throwIfAborted(signal);
      if (peer || closed) throw createSessionError("SESSION_ALREADY_USED", "Bu cihaz oturumu yeniden kullanılamaz.");
      operationController = new AbortController();
      signalingController = new AbortController();
      const detachExternalAbort = forwardAbort(signal, operationController);
      const detachSignalingAbort = forwardAbort(operationController.signal, signalingController);
      const timeout = setTimeout(() => operationController.abort("timeout"), timeoutMs);
      const pendingLocalIce = [];
      const pendingRemoteIce = [];
      let localDescriptionPublished = false;
      let signalingFailure = null;

      try {
        peer = peerFactory({ iceServers: [] });
        installPeerFailureHandlers(peer, operationController);
        peer.onicecandidate = ({ candidate }) => {
          if (!candidate || operationController.signal.aborted || signalingController.signal.aborted) return;
          const payload = candidate.toJSON ? candidate.toJSON() : {
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid ?? null,
            sdpMLineIndex: candidate.sdpMLineIndex ?? null,
          };
          if (!localDescriptionPublished) {
            pendingLocalIce.push(payload);
            return;
          }
          publishIce(payload).catch(failFromSignaling);
        };

        const channelPromise = role === "host"
          ? prepareHost(peer)
          : waitForGuestChannel(peer, operationController.signal);

        const polling = signaling.poll({
          code,
          token,
          signal: signalingController.signal,
          onSignal: (item) => handleSignal(peer, item),
        }).catch(failFromSignaling);
        void polling;

        if (role === "host") {
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          localSdp = peer.localDescription?.sdp ?? offer.sdp;
          await signaling.publish({
            code, token, kind: "offer", sequence: sequence += 1,
            payload: { type: "offer", sdp: localSdp }, signal: signalingController.signal,
          });
          localDescriptionPublished = true;
          await flushLocalIce();
        }

        channel = await channelPromise;
        await waitForOpenChannel(channel, operationController.signal);
        signalingController.abort("channel-open");
        await readyHandshake(channel, { signal: operationController.signal });
        if (role === "host") await closeSignalingRoom();
        emit({ state: "connected" });
        return channel;
      } catch (error) {
        const timedOut = operationController.signal.reason === "timeout";
        const failed = timedOut
          ? createSessionError("DIRECT_CONNECTION_TIMEOUT", "Doğrudan bağlantı 15 saniyede kurulamadı.")
          : mapSessionError(signalingFailure ?? error, signal);
        await cleanup({ closeRoom: true });
        throw failed;
      } finally {
        clearTimeout(timeout);
        detachExternalAbort();
        detachSignalingAbort();
      }

      async function prepareHost(targetPeer) {
        channel = targetPeer.createDataChannel("vaultdrop-nearby-v1", { ordered: true });
        return channel;
      }

      async function handleSignal(targetPeer, item) {
        throwIfAborted(operationController.signal);
        if (item.kind === "offer" && role === "guest") {
          await targetPeer.setRemoteDescription(item.payload);
          remoteSdp = item.payload.sdp;
          await flushRemoteIce(targetPeer);
          const answer = await targetPeer.createAnswer();
          await targetPeer.setLocalDescription(answer);
          localSdp = targetPeer.localDescription?.sdp ?? answer.sdp;
          await signaling.publish({
            code, token, kind: "answer", sequence: sequence += 1,
            payload: { type: "answer", sdp: localSdp }, signal: signalingController.signal,
          });
          localDescriptionPublished = true;
          await flushLocalIce();
        } else if (item.kind === "answer" && role === "host") {
          await targetPeer.setRemoteDescription(item.payload);
          remoteSdp = item.payload.sdp;
          await flushRemoteIce(targetPeer);
        } else if (item.kind === "ice") {
          if (!remoteSdp) pendingRemoteIce.push(item.payload);
          else await targetPeer.addIceCandidate(item.payload);
        }
      }

      function publishIce(payload) {
        return signaling.publish({
          code,
          token,
          kind: "ice",
          sequence: sequence += 1,
          payload,
          signal: signalingController.signal,
        });
      }

      function failFromSignaling(error) {
        if (error?.code === "ABORTED") return;
        signalingFailure ??= error;
        operationController.abort("signaling");
      }

      async function flushLocalIce() {
        while (pendingLocalIce.length > 0) await publishIce(pendingLocalIce.shift());
      }

      async function flushRemoteIce(targetPeer) {
        while (pendingRemoteIce.length > 0) {
          await targetPeer.addIceCandidate(pendingRemoteIce.shift());
        }
      }
    },

    async getVerificationPhrase() {
      if (!localSdp || !remoteSdp) {
        throw createSessionError("SESSION_NOT_VERIFIED", "İki cihazın güvenli bağlantısı henüz tamamlanmadı.");
      }
      return deriveVerificationPhrase({ localSdp, remoteSdp, roomCode: code });
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    close() {
      return cleanup({ closeRoom: true });
    },
  };
}

export function confirmNearbyChannelReady(channel, { signal, retryMs = 100 } = {}) {
  if (!channel || channel.readyState !== "open" || typeof channel.send !== "function") {
    return Promise.reject(createSessionError("CHANNEL_CLOSED", "Cihaz bağlantısı hazır değil."));
  }
  throwIfAborted(signal);

  return new Promise((resolve, reject) => {
    let remoteReady = false;
    let remoteAcknowledged = false;
    let settled = false;
    const retryTimer = setInterval(sendReady, retryMs);
    retryTimer.unref?.();

    function finish() {
      if (settled || !remoteReady || !remoteAcknowledged) return;
      settled = true;
      cleanup();
      resolve();
    }

    function fail(error) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    }

    function sendReady() {
      try {
        channel.send("VDN1|READY");
      } catch {
        fail(createSessionError("CHANNEL_CLOSED", "Cihaz bağlantısı kapandı."));
      }
    }

    function onMessage(event) {
      if (event.data === "VDN1|READY") {
        event.stopImmediatePropagation?.();
        remoteReady = true;
        try {
          channel.send("VDN1|ACK");
        } catch {
          fail(createSessionError("CHANNEL_CLOSED", "Cihaz bağlantısı kapandı."));
          return;
        }
        finish();
      } else if (event.data === "VDN1|ACK") {
        event.stopImmediatePropagation?.();
        remoteAcknowledged = true;
        finish();
      }
    }

    function onAbort() {
      fail(createSessionError("ABORTED", "Bağlantı iptal edildi."));
    }

    function onClose() {
      fail(createSessionError("CHANNEL_CLOSED", "Cihaz bağlantısı kapandı."));
    }

    function cleanup() {
      clearInterval(retryTimer);
      channel.removeEventListener("message", onMessage);
      channel.removeEventListener("close", onClose);
      signal?.removeEventListener("abort", onAbort);
    }

    channel.addEventListener("message", onMessage);
    channel.addEventListener("close", onClose, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });
    sendReady();
  });
}

function defaultPeerFactory(configuration) {
  return new RTCPeerConnection(configuration);
}

function withTimeout(promise, timeoutMs, onTimeout) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();
      reject(createSessionError("SIGNALING_CLOSE_TIMEOUT", "Oda kapatma isteği zaman aşımına uğradı."));
    }, timeoutMs);
    timer.unref?.();
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

function waitForGuestChannel(peer, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(createSessionError("ABORTED", "Bağlantı iptal edildi."));
    signal.addEventListener("abort", abort, { once: true });
    peer.ondatachannel = (event) => {
      signal.removeEventListener("abort", abort);
      resolve(event.channel);
    };
  });
}

function waitForOpenChannel(channel, signal) {
  throwIfAborted(signal);
  if (channel.readyState === "open") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(createSessionError("CHANNEL_CLOSED", "Cihaz bağlantısı kapandı."));
    };
    const abort = () => {
      cleanup();
      reject(createSessionError("ABORTED", "Bağlantı iptal edildi."));
    };
    const cleanup = () => {
      channel.removeEventListener("open", finish);
      channel.removeEventListener("close", fail);
      signal.removeEventListener("abort", abort);
    };
    channel.addEventListener("open", finish, { once: true });
    channel.addEventListener("close", fail, { once: true });
    signal.addEventListener("abort", abort, { once: true });
  });
}

function installPeerFailureHandlers(peer, controller) {
  peer.addEventListener?.("connectionstatechange", () => {
    if (["failed", "disconnected", "closed"].includes(peer.connectionState)) {
      controller.abort("peer-failed");
    }
  });
}

function forwardAbort(signal, controller) {
  if (!signal) return () => {};
  const abort = () => controller.abort("external");
  signal.addEventListener("abort", abort, { once: true });
  return () => signal.removeEventListener("abort", abort);
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw createSessionError("ABORTED", "Bağlantı iptal edildi.");
}

function mapSessionError(error, externalSignal) {
  if (externalSignal?.aborted || error?.code === "ABORTED") {
    return createSessionError("ABORTED", "Bağlantı iptal edildi.");
  }
  return error?.code ? error : createSessionError("DIRECT_CONNECTION_FAILED", error?.message || "Doğrudan bağlantı kurulamadı.");
}

function createSessionError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
