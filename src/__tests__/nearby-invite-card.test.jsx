import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import NearbyInviteCard from '../nearby/NearbyInviteCard.jsx';

const ROOM = Object.freeze({ code: 'ABC234', expiresAt: '2026-08-14T12:05:00.000Z' });
const ORIGIN = 'https://vaultdrop.test';
const NOW = () => new Date('2026-08-14T12:00:00.000Z').getTime();
const INVITE_URL = 'https://vaultdrop.test/transfer?nearby=ABC234';

afterEach(() => {
  vi.useRealTimers();
});

function renderCard(props = {}) {
  return render(
    <NearbyInviteCard
      room={ROOM}
      origin={ORIGIN}
      now={NOW}
      onCancel={vi.fn()}
      onExpire={vi.fn()}
      {...props}
    />,
  );
}

describe('Yakındaki Cihazlar davet kartı', () => {
  it('yalnızca kod içeren davet bağlantısını panoya kopyalar', async () => {
    const clipboard = { writeText: vi.fn().mockResolvedValue() };
    const { container } = renderCard({ clipboard });

    fireEvent.click(screen.getByRole('button', { name: 'Bağlantı davetini kopyala' }));

    expect(clipboard.writeText).toHaveBeenCalledWith(INVITE_URL);
    await Promise.resolve();
    expect(container.innerHTML).not.toMatch(/token|secret|sha/i);
  });

  it('desteklenen paylaşımda yalnızca güvenli davet yükünü gönderir', async () => {
    const share = vi.fn().mockResolvedValue();
    renderCard({ share });

    fireEvent.click(screen.getByRole('button', { name: 'Paylaş' }));

    expect(share).toHaveBeenCalledWith({
      title: 'VaultDrop Yakındaki Cihazlar',
      text: 'Yakındaki cihaz bağlantı daveti',
      url: INVITE_URL,
    });
  });

  it('paylaşım desteklenmiyorsa paylaş düğmesini göstermez', () => {
    renderCard({ share: null });

    expect(screen.queryByRole('button', { name: 'Paylaş' })).not.toBeInTheDocument();
  });

  it('pano reddedilirse seçilebilir salt okunur davet bağlantısını gösterir', async () => {
    const clipboard = { writeText: vi.fn().mockRejectedValue(new Error('Reddedildi')) };
    renderCard({ clipboard });

    fireEvent.click(screen.getByRole('button', { name: 'Bağlantı davetini kopyala' }));

    const fallback = await screen.findByLabelText('Davet bağlantısı');
    expect(fallback).toHaveValue(INVITE_URL);
    expect(fallback).toHaveAttribute('readonly');
    expect(screen.getByText('Otomatik kopyalama kullanılamadı. Bağlantıyı aşağıdan elle kopyala.'))
      .toHaveAttribute('aria-live', 'polite');
  });

  it('Clipboard API yoksa elle kopyalama yedeğini ve erişilebilir geri bildirimi açar', async () => {
    renderCard({ clipboard: null });

    fireEvent.click(screen.getByRole('button', { name: 'Bağlantı davetini kopyala' }));

    expect(await screen.findByLabelText('Davet bağlantısı')).toHaveValue(INVITE_URL);
    expect(screen.getByText('Otomatik kopyalama kullanılamadı. Bağlantıyı aşağıdan elle kopyala.'))
      .toHaveAttribute('aria-live', 'polite');
  });

  it('paylaşım reddini güvenle yakalayıp erişilebilir geri bildirim verir', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('Kullanıcı iptal etti', 'AbortError'));
    renderCard({ share });

    fireEvent.click(screen.getByRole('button', { name: 'Paylaş' }));

    expect(await screen.findByText('Paylaşım tamamlanmadı. Bağlantıyı kopyalayabilirsin.'))
      .toHaveAttribute('aria-live', 'polite');
  });

  it('süre dolduğunda onExpire çağrısını yalnızca bir kez yapar', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-14T12:00:00.000Z'));
    const onExpire = vi.fn();
    renderCard({
      room: { ...ROOM, expiresAt: '2026-08-14T12:00:01.000Z' },
      now: () => Date.now(),
      onExpire,
    });

    act(() => vi.advanceTimersByTime(2_000));

    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('daveti iptal ettiğinde yalnızca onCancel çağrılır', () => {
    const onCancel = vi.fn();
    const onExpire = vi.fn();
    renderCard({ onCancel, onExpire });

    fireEvent.click(screen.getByRole('button', { name: 'Daveti iptal et' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onExpire).not.toHaveBeenCalled();
  });
});
