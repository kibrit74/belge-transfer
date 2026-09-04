import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "./api/client.js";
import { createNearbyHashClient } from "./nearby/hash-client.js";
import { createNearbyPeerSession } from "./nearby/peer-session.js";
import { createNearbyReceiveController } from "./nearby/receive-controller.js";
import { createNearbySendController } from "./nearby/send-controller.js";
import { createNearbySignalingClient } from "./nearby/signaling-client.js";
import { NEARBY_ROOM_CODE_PATTERN, normalizeNearbyRoomCode } from "./nearby/invite-link.js";
import { NEARBY_VERIFIED_MESSAGE } from "./nearby/protocol-v1.js";
import NearbyInviteCard from "./nearby/NearbyInviteCard.jsx";
import {
  completeTransferActivity,
  recordReceiveActivity,
  reserveTransferActivity,
} from "./transfer/activity-client.js";
import { validateTransferSelection } from "./transfer/usage-policy.js";

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const NEARBY_ERROR_MESSAGES = Object.freeze({
  ROOM_EXPIRED: "Bu davetin süresi dolmuş. Göndericiden yeni davet iste.",
  ROOM_CANCELLED: "Gönderici bu daveti iptal etmiş.",
  ROOM_ALREADY_JOINED: "Bu davet daha önce kullanılmış.",
  ROOM_CONFLICT: "Bu davet daha önce kullanılmış.",
  RATE_LIMITED: "Çok fazla bağlantı denemesi yapıldı. Biraz bekleyip yeniden dene.",
});

export default function NearbyTransferPanel({
  mode = "send",
  initialCode = "",
  user,
  signaling: suppliedSignaling,
  peerSessionFactory = createNearbyPeerSession,
  sendControllerFactory = createNearbySendController,
  receiveControllerFactory = createNearbyReceiveController,
  reserveActivity = reserveTransferActivity,
  completeActivity = completeTransferActivity,
  recordReceive = recordReceiveActivity,
  onVaultDrop,
} = {}) {
  const signaling = useMemo(
    () => suppliedSignaling ?? createNearbySignalingClient({ apiRequest }),
    [suppliedSignaling],
  );
  const [status, setStatus] = useState("idle");
  const [file, setFile] = useState(null);
  const [room, setRoom] = useState(null);
  const [code, setCode] = useState(() => normalizeNearbyRoomCode(initialCode) ?? "");
  const openedFromInvite = mode === "receive" && Boolean(normalizeNearbyRoomCode(initialCode));
  const [phrase, setPhrase] = useState("");
  const [offer, setOffer] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [download, setDownload] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const peerRef = useRef(null);
  const channelRef = useRef(null);
  const receiverRef = useRef(null);
  const hashClientRef = useRef(null);
  const operationRef = useRef(null);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const downloadRef = useRef(null);
  const roomRef = useRef(null);
  const phraseConfirmedRef = useRef(false);
  const joiningRef = useRef(false);
  const offerAcceptedRef = useRef(false);
  const verificationRef = useRef(null);
  const fileRef = useRef(file);
  const reservationRef = useRef(null);
  const startedAtRef = useRef(null);
  const completeActivityRef = useRef(completeActivity);
  const userRef = useRef(user);
  completeActivityRef.current = completeActivity;
  userRef.current = user;
  fileRef.current = file;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      roomRef.current = null;
      cleanupVerificationHandshake();
      operationRef.current?.abort();
      receiverRef.current?.close?.();
      peerRef.current?.close?.();
      hashClientRef.current?.close?.();
      settleReservationSafely(reservationRef.current?.terminalStatus ?? "failed");
      if (downloadRef.current?.url) URL.revokeObjectURL(downloadRef.current.url);
    };
  }, []);

  async function prepareSend(selectedFile) {
    const generation = ++generationRef.current;
    resetActiveTransfer();
    fileRef.current = selectedFile;
    setFile(selectedFile);
    setError("");
    setProgress(0);
    setStatus("creating-room");
    operationRef.current = new AbortController();
    startedAtRef.current = new Date();
    try {
      validateTransferSelection([selectedFile], { method: "nearby", user });
      if (selectedFile.size > MAX_FILE_BYTES) {
        throw new RangeError("Yakındaki Cihazlar tek dosyada en fazla 100 MiB destekler.");
      }
      const reservation = await reserveActivity({
        user, method: "nearby", files: [selectedFile], startedAt: startedAtRef.current,
      });
      const nextReservation = {
        id: reservation?.id ?? null,
        settled: false,
        terminalStatus: null,
        settlingPromise: null,
      };
      if (!isCurrent(generation)) {
        await settleSpecificReservation(nextReservation, "failed");
        return;
      }
      reservationRef.current = nextReservation;
      const created = await signaling.createRoom();
      const peer = peerSessionFactory({
        role: "host", code: created.code, token: created.token, signaling,
      });
      if (!isCurrent(generation)) {
        await peer.close?.();
        return;
      }
      peerRef.current = peer;
      const expiresAt = new Date(created.expiresAt).getTime();
      if (!Number.isFinite(expiresAt)) {
        throw Object.assign(new Error("Davet süresi geçersiz. Yeni davet oluştur."), {
          code: "INVALID_INVITE_EXPIRY",
        });
      }
      const hostWaitMs = Math.max(1, expiresAt - Date.now());
      setActiveRoom(created);
      setStatus("waiting-recipient");
      const channel = await peer.connect({
        signal: operationRef.current.signal,
        timeoutMs: hostWaitMs,
      });
      if (!isCurrent(generation)) {
        channel?.close?.();
        return;
      }
      channelRef.current = channel;
      armVerificationHandshake(channel, generation);
      const verificationPhrase = await peer.getVerificationPhrase();
      if (!isCurrent(generation)) return;
      setPhrase(verificationPhrase);
      setStatus("verify");
    } catch (caught) {
      handleFailure(caught, generation);
    }
  }

  async function connectReceiver(event) {
    event.preventDefault();
    const activeStatus = !["idle", "failed"].includes(status);
    const activeRoomOrChannel = Boolean(roomRef.current || channelRef.current) && status !== "failed";
    if (joiningRef.current || activeStatus || activeRoomOrChannel) return;
    joiningRef.current = true;
    const generation = ++generationRef.current;
    resetActiveTransfer();
    setError("");
    setStatus("connecting");
    operationRef.current = new AbortController();
    startedAtRef.current = new Date();
    try {
      const joined = await signaling.joinRoom(code.trim().toUpperCase(), {
        signal: operationRef.current.signal,
      });
      if (!isCurrent(generation)) return;
      setActiveRoom(joined);
      const peer = peerSessionFactory({
        role: "guest", code: joined.code, token: joined.token, signaling,
      });
      peerRef.current = peer;
      const channel = await peer.connect({ signal: operationRef.current.signal, timeoutMs: 15_000 });
      channelRef.current = channel;
      armVerificationHandshake(channel, generation);
      const verificationPhrase = await peer.getVerificationPhrase();
      if (!isCurrent(generation)) return;
      setPhrase(verificationPhrase);
      setStatus("verify");
    } catch (caught) {
      handleFailure(caught, generation);
    } finally {
      joiningRef.current = false;
    }
  }

  function confirmPhrase() {
    const verification = verificationRef.current;
    const channel = channelRef.current;
    if (
      !verification ||
      verification.generation !== generationRef.current ||
      verification.local ||
      channel?.readyState !== "open"
    ) return;

    verification.local = true;
    phraseConfirmedRef.current = true;
    setStatus("waiting-peer-verification");
    try {
      channel.send(NEARBY_VERIFIED_MESSAGE);
    } catch {
      failVerificationHandshake(verification.generation);
      return;
    }
    void startVerifiedTransfer(verification.generation);
  }

  function armVerificationHandshake(channel, generation) {
    cleanupVerificationHandshake();
    const verification = {
      generation,
      local: false,
      remote: false,
      started: false,
      remove: null,
    };
    const onMessage = (event) => {
      if (event.data !== NEARBY_VERIFIED_MESSAGE || !isCurrent(generation)) return;
      const firstRemoteConfirmation = !verification.remote;
      verification.remote = true;
      if (firstRemoteConfirmation && verification.local) {
        try {
          channel.send(NEARBY_VERIFIED_MESSAGE);
        } catch {
          failVerificationHandshake(generation);
          return;
        }
      }
      void startVerifiedTransfer(generation);
    };
    verification.remove = () => channel.removeEventListener("message", onMessage);
    verificationRef.current = verification;
    channel.addEventListener("message", onMessage);
  }

  function cleanupVerificationHandshake() {
    verificationRef.current?.remove?.();
    verificationRef.current = null;
  }

  async function startVerifiedTransfer(generation) {
    const verification = verificationRef.current;
    if (
      !isCurrent(generation) ||
      !verification ||
      verification.generation !== generation ||
      !verification.local ||
      !verification.remote ||
      verification.started
    ) return;

    verification.started = true;
    verification.remove?.();
    verification.remove = null;

    if (mode === "receive") {
      const receiver = receiveControllerFactory({ channel: channelRef.current });
      receiverRef.current = receiver;
      receiver.subscribe((next) => handleReceiveState(next, generation));
      receiver.result()
        .then((result) => finishReceive(result, generation))
        .catch((caught) => handleFailure(caught, generation));
      setStatus("waiting-file");
      return;
    }

    const selectedFile = fileRef.current;
    if (!selectedFile || !channelRef.current) return;
    setStatus("awaiting-approval");
    try {
      const hashClient = createNearbyHashClient();
      hashClientRef.current = hashClient;
      const sender = sendControllerFactory({
        channel: channelRef.current,
        hashFile: (target, options) => hashClient.hash(target, options),
      });
      await sender.send(selectedFile, {
        signal: operationRef.current.signal,
        onProgress: (next) => {
          if (!isCurrent(generation)) return;
          const total = next.totalBytes || selectedFile.size || 1;
          setProgress(Math.round((next.bytesSent / total) * 100));
          if (next.stage === "sending") setStatus("transferring");
        },
      });
      if (!isCurrent(generation)) return;
      setProgress(100);
      setStatus("complete");
      settleReservationSafely("completed");
    } catch (caught) {
      handleFailure(caught, generation);
    } finally {
      hashClientRef.current?.close?.();
      hashClientRef.current = null;
    }
  }

  function handleReceiveState(next, generation) {
    if (!isCurrent(generation)) return;
    if (next.state === "offered") {
      offerAcceptedRef.current = false;
      setOffer(next.file);
      if (phraseConfirmedRef.current) setStatus("awaiting-approval");
    } else if (next.state === "accepted") {
      offerAcceptedRef.current = true;
      setStatus("accepted");
    } else if (next.state === "receiving") {
      setStatus("transferring");
      setProgress(Math.round((next.bytesReceived / Math.max(next.totalBytes, 1)) * 100));
    } else if (next.state === "verifying") {
      setStatus("verifying");
      setProgress(100);
    }
  }

  function finishReceive(result, generation) {
    if (!isCurrent(generation)) return;
    const url = URL.createObjectURL(result.file);
    setDownload((previous) => {
      if (previous?.url) URL.revokeObjectURL(previous.url);
      const next = { url, file: result.file, sha256: result.sha256 };
      downloadRef.current = next;
      return next;
    });
    setStatus("complete");
    void recordReceive({
      user,
      method: "nearby",
      files: [result.file],
      startedAt: startedAtRef.current ?? new Date(),
      completedAt: new Date(),
    });
  }

  function handleFailure(caught, generation) {
    if (!isCurrent(generation) || caught?.code === "ABORTED") return;
    if (caught?.code === "INVALID_INVITE_EXPIRY") {
      generationRef.current += 1;
      resetActiveTransfer();
      setActiveRoom(null);
      setFile(null);
      setProgress(0);
      setStatus("failed");
      setError(caught.message);
      return;
    }
    const timeout = caught?.code === "DIRECT_CONNECTION_TIMEOUT";
    if (timeout && mode === "send" && roomRef.current) {
      cancelInvite("expired");
      return;
    }
    setError(nearbyErrorMessage(caught));
    setStatus("failed");
    settleReservationSafely(reservationRef.current?.terminalStatus ?? "failed");
  }

  function rejectVerificationPhrase() {
    generationRef.current += 1;
    resetActiveTransfer();
    roomRef.current = null;
    setRoom(null);
    setStatus("failed");
    setError("Doğrulama ifadeleri eşleşmedi. Bağlantı güvenlik için kapatıldı.");
  }

  function failVerificationHandshake(generation) {
    if (!isCurrent(generation)) return;
    generationRef.current += 1;
    resetActiveTransfer();
    roomRef.current = null;
    setRoom(null);
    setStatus("failed");
    setError("Doğrulama onayı gönderilemedi. Bağlantı güvenlik için kapatıldı.");
  }

  function resetActiveTransfer() {
    cleanupVerificationHandshake();
    operationRef.current?.abort();
    settleReservationSafely(reservationRef.current?.terminalStatus ?? "failed");
    receiverRef.current?.close?.();
    peerRef.current?.close?.();
    hashClientRef.current?.close?.();
    operationRef.current = null;
    receiverRef.current = null;
    peerRef.current = null;
    hashClientRef.current = null;
    channelRef.current = null;
    setOffer(null);
    offerAcceptedRef.current = false;
    phraseConfirmedRef.current = false;
    setPhrase("");
    setDownload((previous) => {
      if (previous?.url) URL.revokeObjectURL(previous.url);
      downloadRef.current = null;
      return null;
    });
  }

  function setActiveRoom(nextRoom) {
    roomRef.current = nextRoom;
    setRoom(nextRoom);
  }

  function cancelInvite(reason) {
    generationRef.current += 1;
    resetActiveTransfer();
    setActiveRoom(null);
    setFile(null);
    setProgress(0);
    setStatus(reason);
    setError(reason === "expired" ? "Davet süresi doldu. Yeni davet oluştur." : "");
  }

  function isCurrent(generation) {
    return mountedRef.current && generationRef.current === generation;
  }

  function acceptOfferedFile() {
    if (offerAcceptedRef.current) return;
    offerAcceptedRef.current = true;
    try {
      receiverRef.current?.accept();
    } catch {
      offerAcceptedRef.current = false;
      setError("Dosya kabulü tamamlanamadı. Bağlantıyı yeniden dene.");
    }
  }

  async function settleReservation(nextStatus) {
    const reservation = reservationRef.current;
    return settleSpecificReservation(reservation, nextStatus);
  }

  function settleReservationSafely(nextStatus) {
    void settleReservation(nextStatus).catch(() => {});
  }

  function settleSpecificReservation(reservation, nextStatus) {
    if (!reservation || reservation.settled) return null;
    if (reservation.terminalStatus && reservation.terminalStatus !== nextStatus) return null;
    reservation.terminalStatus ??= nextStatus;
    if (reservation.settlingPromise) return reservation.settlingPromise;

    const settlingPromise = Promise.resolve()
      .then(() => completeActivityRef.current({
        user: userRef.current,
        reservationId: reservation.id,
        status: nextStatus,
        completedAt: new Date(),
      }))
      .then((result) => {
        reservation.settled = true;
        return result;
      })
      .finally(() => {
        if (reservation.settlingPromise === settlingPromise) {
          reservation.settlingPromise = null;
        }
      });
    reservation.settlingPromise = settlingPromise;
    return settlingPromise;
  }

  function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    const droppedFile = event.dataTransfer?.files?.[0];
    if (droppedFile) {
      prepareSend(droppedFile);
    }
  }

  return (
    <section className="nearby-transfer-panel" data-testid="nearby-transfer-panel" aria-labelledby="nearby-title">
      <header className="nearby-transfer-header">
        <span className="eyebrow">● YAKINDAKİ CİHAZLAR</span>
        <h2 id="nearby-title">{mode === "send" ? "Aynı ağdaki cihaza gönder" : "Aynı ağdaki cihazdan al"}</h2>
        <p>Dosya doğrudan iki tarayıcı arasında gider. Sunucu dosyanı görmez veya saklamaz.</p>
        {openedFromInvite && (
          <p className="nearby-invite-notice">Yakındaki bir cihaz sana bağlantı daveti gönderdi.</p>
        )}
      </header>

      {mode === "send" && (
        <label
          className={`dropzone ${isDragging ? "drag-over" : ""}`.trim()}
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            type="file"
            aria-label="Yakındaki cihaza gönderilecek dosya"
            onClick={(event) => {
              event.target.value = "";
            }}
            onChange={(event) => event.target.files?.[0] && prepareSend(event.target.files[0])}
            hidden
          />
          <span className="dropzone-title">Dosya seç</span>
          <span className="dropzone-sub">Tek dosya · en fazla 100 MiB</span>
        </label>
      )}

      {mode === "receive" && (
        <form className="nearby-code-form" onSubmit={connectReceiver}>
          <label htmlFor="nearby-room-code">Yakındaki cihaz kodu</label>
          <input
            id="nearby-room-code"
            value={code}
            maxLength={6}
            autoComplete="one-time-code"
            placeholder="ABC234"
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
          <button
            className="nearby-primary-action"
            type="submit"
            disabled={
              !NEARBY_ROOM_CODE_PATTERN.test(code) ||
              joiningRef.current ||
              !["idle", "failed"].includes(status)
            }
          >
            Bağlan
          </button>
        </form>
      )}

      {mode === "receive" && room && (
        <div className="nearby-room-card">
          <span>6 karakterli kod</span>
          <strong>{room.code}</strong>
          <small>Kod 5 dakika geçerlidir.</small>
        </div>
      )}

      {mode === "send" && room && ["waiting-recipient", "connecting"].includes(status) && (
        <NearbyInviteCard
          room={room}
          onCancel={() => cancelInvite("cancelled")}
          onExpire={() => cancelInvite("expired")}
        />
      )}

      {status === "connecting" && <p role="status">Cihazla doğrudan bağlantı kuruluyor…</p>}
      {status === "waiting-peer-verification" && <p role="status">Diğer cihazın doğrulama onayı bekleniyor…</p>}

      {phrase && ["verify", "waiting-peer-verification", "waiting-file"].includes(status) && (
        <div className="nearby-verification-card">
          <span>İki ekrandaki ifadeyi karşılaştır</span>
          <strong>{phrase}</strong>
          <p>Aynı doğrulama ifadesini görüyorsan devam et.</p>
          {status === "verify" && (
            <div className="nearby-action-row">
              <button className="nearby-primary-action" type="button" onClick={confirmPhrase}>İfadeler aynı, devam et</button>
              <button type="button" onClick={rejectVerificationPhrase}>İfadeler farklı, bağlantıyı kapat</button>
            </div>
          )}
        </div>
      )}

      {offer && status === "awaiting-approval" && mode === "receive" && (
        <div className="nearby-offer-card">
          <span>Gönderilmek istenen dosya</span>
          <strong>{offer.name}</strong>
          <small>{formatBytes(offer.size)}</small>
          <div className="nearby-action-row">
            <button className="nearby-primary-action" type="button" onClick={acceptOfferedFile}>
              Dosyayı kabul et
            </button>
            <button type="button" onClick={() => receiverRef.current.reject("Kullanıcı reddetti")}>Reddet</button>
          </div>
        </div>
      )}

      {status === "awaiting-approval" && mode === "send" && <p role="status">Alıcının onayı bekleniyor…</p>}
      {status === "accepted" && mode === "receive" && <p role="status">Dosya kabul edildi, aktarım bekleniyor…</p>}
      {["transferring", "verifying"].includes(status) && (
        <div className="nearby-progress" role="status">
          <div><span>{status === "verifying" ? "Dosya doğrulanıyor" : "Dosya aktarılıyor"}</span><strong>%{progress}</strong></div>
          <progress value={progress} max="100" />
        </div>
      )}

      {status === "complete" && mode === "send" && <p className="nearby-success" role="status">Dosya gönderildi.</p>}
      {download && (
        <div className="nearby-success" role="status">
          <p>Dosya doğrulandı ve hazır.</p>
          <a className="nearby-primary-action" href={download.url} download={download.file.name}>Dosyayı indir</a>
        </div>
      )}
      {error && <p className="nearby-error" role="alert">{error}</p>}
      {error && file && onVaultDrop && (
        <button
          className="nearby-primary-action"
          type="button"
          onClick={() => {
            resetActiveTransfer();
            onVaultDrop(file);
          }}
        >
          VaultDrop ile devam et
        </button>
      )}

      <footer className="nearby-transfer-note">
        Aynı ağ bazı kurumsal veya misafir Wi‑Fi’larda cihazları birbirinden ayırabilir. Bağlantı kurulmazsa VaultDrop kullan.
      </footer>
    </section>
  );
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} bayt`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function nearbyErrorMessage(error) {
  if (error?.code === "DIRECT_CONNECTION_TIMEOUT") {
    return "Doğrudan bağlantı 15 saniyede kurulamadı. Bu ağda VaultDrop kullan.";
  }
  return NEARBY_ERROR_MESSAGES[error?.code]
    ?? error?.message
    ?? "Cihaz bağlantısı tamamlanamadı.";
}
