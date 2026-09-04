import { useEffect, useMemo, useRef, useState } from 'react';
import { createNearbyInviteUrl } from './invite-link.js';

const systemNow = () => Date.now();

function secondsUntil(expiresAt, nowMs) {
  const expiryMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiryMs)) return 0;
  return Math.max(0, Math.ceil((expiryMs - nowMs) / 1000));
}

function formatCountdown(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

export default function NearbyInviteCard({
  room,
  onCancel,
  onExpire,
  origin = globalThis.location?.origin ?? 'http://localhost',
  clipboard = globalThis.navigator?.clipboard,
  share = typeof globalThis.navigator?.share === 'function'
    ? globalThis.navigator.share.bind(globalThis.navigator)
    : null,
  now = systemNow,
}) {
  const inviteUrl = useMemo(
    () => createNearbyInviteUrl({ origin, code: room.code }),
    [origin, room.code],
  );
  const [remainingSeconds, setRemainingSeconds] = useState(() => secondsUntil(room.expiresAt, now()));
  const [copyFailed, setCopyFailed] = useState(false);
  const [actionFeedback, setActionFeedback] = useState('');
  const onExpireRef = useRef(onExpire);
  const expiredExpiriesRef = useRef(new Set());

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    const expiresAt = room.expiresAt;
    let timerId;

    const updateCountdown = () => {
      const seconds = secondsUntil(expiresAt, now());
      setRemainingSeconds(seconds);

      if (seconds === 0) {
        if (!expiredExpiriesRef.current.has(expiresAt)) {
          expiredExpiriesRef.current.add(expiresAt);
          onExpireRef.current();
        }
        if (timerId) clearInterval(timerId);
      }
    };

    updateCountdown();
    if (!expiredExpiriesRef.current.has(expiresAt)) {
      timerId = setInterval(updateCountdown, 250);
    }

    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [room.expiresAt, now]);

  const copyInvite = async () => {
    try {
      if (typeof clipboard?.writeText !== 'function') throw new Error('Clipboard API kullanılamıyor.');
      await clipboard.writeText(inviteUrl);
      setCopyFailed(false);
      setActionFeedback('Davet bağlantısı kopyalandı.');
    } catch {
      setCopyFailed(true);
      setActionFeedback('Otomatik kopyalama kullanılamadı. Bağlantıyı aşağıdan elle kopyala.');
    }
  };

  const shareInvite = async () => {
    try {
      await share({
        title: 'VaultDrop Yakındaki Cihazlar',
        text: 'Yakındaki cihaz bağlantı daveti',
        url: inviteUrl,
      });
      setActionFeedback('Paylaşım tamamlandı.');
    } catch {
      setActionFeedback('Paylaşım tamamlanmadı. Bağlantıyı kopyalayabilirsin.');
    }
  };

  return (
    <section className="nearby-invite-card" aria-label="Yakındaki Cihazlar daveti">
      <p>Bağlantıyı ikinci cihazda aç. Dosya, bu bağlantının içinden geçmez.</p>
      <output aria-label="Davet için kalan süre">{formatCountdown(remainingSeconds)}</output>
      <strong aria-label="Kısa bağlantı kodu">{room.code}</strong>
      <div className="nearby-invite-actions">
        <button type="button" onClick={copyInvite}>Bağlantı davetini kopyala</button>
        {share && <button type="button" onClick={shareInvite}>Paylaş</button>}
        <button type="button" onClick={onCancel}>Daveti iptal et</button>
      </div>
      {actionFeedback && <p aria-live="polite">{actionFeedback}</p>}
      {copyFailed && (
        <label>
          Davet bağlantısı
          <input
            className="nearby-invite-fallback"
            readOnly
            value={inviteUrl}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
    </section>
  );
}
