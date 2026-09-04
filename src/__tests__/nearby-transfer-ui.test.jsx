import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import NearbyTransferPanel from "../NearbyTransferPanel.jsx";
import { apiRequest } from "../api/client.js";
import { createNearbyReceiveController } from "../nearby/receive-controller.js";
import { createNearbySendController } from "../nearby/send-controller.js";
import { createNearbySignalingClient } from "../nearby/signaling-client.js";
import { encodeControlMessage } from "../nearby/protocol-v1.js";

const ROOM = { code: "ABC234", token: "secret", expiresAt: new Date(Date.now() + 300_000).toISOString() };

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function channel() {
  return new LinkedChannel();
}

class LinkedChannel extends EventTarget {
  constructor() {
    super();
    this.readyState = "open";
    this.bufferedAmount = 0;
    this.sent = [];
    this.remote = null;
  }

  send(value) {
    this.sent.push(value);
    queueMicrotask(() => {
      if (this.remote?.readyState === "open") {
        this.remote.dispatchEvent(new MessageEvent("message", { data: value }));
      }
    });
  }

  receive(value) {
    this.dispatchEvent(new MessageEvent("message", { data: value }));
  }

  close = vi.fn(() => {
    this.readyState = "closed";
    this.dispatchEvent(new Event("close"));
  });
}

function linkedChannels() {
  const host = new LinkedChannel();
  const guest = new LinkedChannel();
  host.remote = guest;
  guest.remote = host;
  return { host, guest };
}

describe("Yakındaki Cihazlar arayüzü", () => {
  it("davet kodunu doldurur ve yalnız açık kullanıcı onayıyla bir kez bağlanır", async () => {
    const signaling = { joinRoom: vi.fn(() => new Promise(() => {})) };

    const view = render(<NearbyTransferPanel mode="receive" initialCode="ABC234" signaling={signaling} />);

    expect(screen.getByLabelText("Yakındaki cihaz kodu")).toHaveValue("ABC234");
    expect(screen.getByText("Yakındaki bir cihaz sana bağlantı daveti gönderdi.")).toBeInTheDocument();
    expect(signaling.joinRoom).not.toHaveBeenCalled();
    const connectButton = screen.getByRole("button", { name: "Bağlan" });
    expect(connectButton).toBeEnabled();

    fireEvent.click(connectButton);

    await waitFor(() => expect(signaling.joinRoom).toHaveBeenCalledTimes(1));
    const [, options] = signaling.joinRoom.mock.calls[0];
    expect(signaling.joinRoom).toHaveBeenCalledWith("ABC234", {
      signal: expect.any(AbortSignal),
    });
    expect(options.signal.aborted).toBe(false);

    view.unmount();

    expect(options.signal.aborted).toBe(true);
  });

  it("yalnız ortak oda kodu sözleşmesine uyan kodlarda bağlanmayı etkinleştirir", () => {
    render(<NearbyTransferPanel mode="receive" signaling={{ joinRoom: vi.fn() }} />);
    const input = screen.getByLabelText("Yakındaki cihaz kodu");
    const connectButton = screen.getByRole("button", { name: "Bağlan" });

    fireEvent.change(input, { target: { value: "O0I1XX" } });
    expect(connectButton).toBeDisabled();

    fireEvent.change(input, { target: { value: "ABC234" } });
    expect(connectButton).toBeEnabled();
  });

  it("hızlı çift form gönderiminde odaya yalnız bir kez katılır", async () => {
    const pendingJoin = deferred();
    const signaling = { joinRoom: vi.fn(() => pendingJoin.promise) };
    render(<NearbyTransferPanel mode="receive" initialCode="ABC234" signaling={signaling} />);
    const form = screen.getByRole("button", { name: "Bağlan" }).closest("form");

    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(signaling.joinRoom).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Bağlan" })).toBeDisabled();
  });

  it("bağlantı kurulduktan sonraki programatik submit mevcut oturumu yeniden başlatmaz", async () => {
    const dataChannel = channel();
    const signaling = {
      joinRoom: vi.fn()
        .mockResolvedValueOnce(ROOM)
        .mockImplementation(() => new Promise(() => {})),
    };
    const peer = {
      connect: vi.fn().mockResolvedValue(dataChannel),
      getVerificationPhrase: vi.fn().mockResolvedValue("Mavi Kale · Sakin Martı"),
      close: vi.fn(),
    };
    render(<NearbyTransferPanel
      mode="receive"
      initialCode="ABC234"
      signaling={signaling}
      peerSessionFactory={() => peer}
    />);
    const form = screen.getByRole("button", { name: "Bağlan" }).closest("form");
    fireEvent.submit(form);
    expect(await screen.findByText("Mavi Kale · Sakin Martı")).toBeInTheDocument();

    fireEvent.submit(form);
    await flushMicrotasks();

    expect(signaling.joinRoom).toHaveBeenCalledTimes(1);
    expect(peer.close).not.toHaveBeenCalled();
    expect(screen.getByText("Mavi Kale · Sakin Martı")).toBeInTheDocument();
  });

  it("alıcı dosyayı ilk tıklamada kabul edilmiş duruma geçirir ve ikinci tıklamayı güvenle yutar", async () => {
    const dataChannel = channel();
    const peer = {
      connect: vi.fn().mockResolvedValue(dataChannel),
      getVerificationPhrase: vi.fn().mockResolvedValue("Mavi Kale · Sakin Martı"),
      close: vi.fn(),
    };
    render(<NearbyTransferPanel
      mode="receive"
      initialCode="ABC234"
      signaling={{ joinRoom: vi.fn().mockResolvedValue(ROOM) }}
      peerSessionFactory={() => peer}
      receiveControllerFactory={({ channel: receiverChannel }) => createNearbyReceiveController({
        channel: receiverChannel,
        hashBytes: vi.fn().mockResolvedValue("A".repeat(43)),
      })}
    />);
    fireEvent.click(screen.getByRole("button", { name: "Bağlan" }));
    fireEvent.click(await screen.findByRole("button", { name: "İfadeler aynı, devam et" }));
    act(() => dataChannel.receive("VDN1|VERIFIED"));
    act(() => dataChannel.receive(encodeControlMessage({
      version: "NDP1",
      type: "offer-file",
      transferId: "abcdefghijklmnop",
      name: "rapor.txt",
      mime: "text/plain",
      size: 3,
      sha256: "A".repeat(43),
    })));
    const acceptButton = await screen.findByRole("button", { name: "Dosyayı kabul et" });

    expect(() => {
      fireEvent.click(acceptButton);
      fireEvent.click(acceptButton);
    }).not.toThrow();

    expect(screen.queryByRole("button", { name: "Dosyayı kabul et" })).not.toBeInTheDocument();
    expect(screen.getByText("Dosya kabul edildi, aktarım bekleniyor…")).toBeInTheDocument();
  });

  it.each([
    ["ROOM_EXPIRED", "Bu davetin süresi dolmuş. Göndericiden yeni davet iste."],
    ["ROOM_CANCELLED", "Gönderici bu daveti iptal etmiş."],
    ["ROOM_ALREADY_JOINED", "Bu davet daha önce kullanılmış."],
    ["ROOM_CONFLICT", "Bu davet daha önce kullanılmış."],
    ["RATE_LIMITED", "Çok fazla bağlantı denemesi yapıldı. Biraz bekleyip yeniden dene."],
  ])("%s sunucu hatasında yalnız güvenli kullanıcı mesajını gösterir", async (code, safeMessage) => {
    const rawMessage = `SUNUCU AYRINTISI: ${code}`;
    const signaling = {
      joinRoom: vi.fn().mockRejectedValue(Object.assign(new Error(rawMessage), { code })),
    };
    render(<NearbyTransferPanel mode="receive" initialCode="ABC234" signaling={signaling} />);

    fireEvent.click(screen.getByRole("button", { name: "Bağlan" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(safeMessage);
    expect(screen.queryByText(rawMessage)).not.toBeInTheDocument();
  });

  it("gerçek API hata kodunu signaling zincirinden geçirip iptal mesajına dönüştürür", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: "ROOM_CANCELLED",
      error: "Gönderici bu daveti iptal etmiş.",
    }), {
      status: 410,
      headers: { "Content-Type": "application/json" },
    })));
    const signaling = createNearbySignalingClient({ apiRequest });
    render(<NearbyTransferPanel mode="receive" initialCode="ABC234" signaling={signaling} />);

    fireEvent.click(screen.getByRole("button", { name: "Bağlan" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Gönderici bu daveti iptal etmiş.");
    expect(screen.queryByText("Bu davetin süresi dolmuş. Göndericiden yeni davet iste.")).not.toBeInTheDocument();
  });

  it("göndericide dosya seçince 6 karakterli kod ve doğrulama ifadesini gösterir", async () => {
    const dataChannel = channel();
    const signaling = { createRoom: vi.fn().mockResolvedValue(ROOM), close: vi.fn() };
    const peer = {
      connect: vi.fn().mockResolvedValue(dataChannel),
      getVerificationPhrase: vi.fn().mockResolvedValue("Mavi Kale · Sakin Martı"),
      close: vi.fn(),
    };
    const sender = { send: vi.fn().mockResolvedValue({ bytesSent: 3, sha256: "A".repeat(43) }) };
    render(<NearbyTransferPanel
      mode="send"
      user={{ id: "user-1", plan: "standard" }}
      signaling={signaling}
      peerSessionFactory={() => peer}
      sendControllerFactory={() => sender}
      reserveActivity={async () => ({ id: "reservation-1" })}
      completeActivity={async () => ({ id: "reservation-1" })}
    />);

    fireEvent.change(screen.getByLabelText("Yakındaki cihaza gönderilecek dosya"), {
      target: { files: [new File(["abc"], "rapor.txt", { type: "text/plain" })] },
    });

    expect(await screen.findByText("Mavi Kale · Sakin Martı")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /İfadeler aynı/i }));
    act(() => dataChannel.receive("VDN1|VERIFIED"));
    expect(sender.send).toHaveBeenCalledWith(expect.any(File), expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(await screen.findByText(/Dosya gönderildi/i)).toBeInTheDocument();
  });

  it("dosya tesliminden sonraki geçici tamamlanma kayıt hatası başarıyı geri almaz", async () => {
    const dataChannel = channel();
    const completeActivity = vi.fn()
      .mockRejectedValueOnce(new Error("Geçici kayıt hatası"))
      .mockResolvedValueOnce({ id: "reservation-1", status: "completed" });
    const onVaultDrop = vi.fn();
    const peer = {
      connect: vi.fn().mockResolvedValue(dataChannel),
      getVerificationPhrase: vi.fn().mockResolvedValue("Mavi Kale · Sakin Martı"),
      close: vi.fn(),
    };
    const sender = { send: vi.fn().mockResolvedValue({ bytesSent: 3, sha256: "A".repeat(43) }) };
    const view = render(<NearbyTransferPanel
      mode="send"
      user={{ id: "user-1", plan: "standard" }}
      signaling={{ createRoom: vi.fn().mockResolvedValue(ROOM) }}
      peerSessionFactory={() => peer}
      sendControllerFactory={() => sender}
      reserveActivity={vi.fn().mockResolvedValue({ id: "reservation-1" })}
      completeActivity={completeActivity}
      onVaultDrop={onVaultDrop}
    />);

    fireEvent.change(screen.getByLabelText("Yakındaki cihaza gönderilecek dosya"), {
      target: { files: [new File(["abc"], "rapor.txt", { type: "text/plain" })] },
    });
    fireEvent.click(await screen.findByRole("button", { name: "İfadeler aynı, devam et" }));
    act(() => dataChannel.receive("VDN1|VERIFIED"));

    expect(await screen.findByText("Dosya gönderildi.")).toBeInTheDocument();
    await waitFor(() => expect(completeActivity).toHaveBeenCalledTimes(1));
    await flushMicrotasks();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "VaultDrop ile devam et" })).not.toBeInTheDocument();
    expect(onVaultDrop).not.toHaveBeenCalled();
    expect(completeActivity.mock.calls.map(([activity]) => activity.status)).toEqual(["completed"]);

    view.unmount();
    await waitFor(() => expect(completeActivity).toHaveBeenCalledTimes(2));
    expect(completeActivity.mock.calls.map(([activity]) => activity.status)).toEqual([
      "completed",
      "completed",
    ]);
  });

  it("gönderici daveti bağlantı kurulmadan gösterir ve oda süresinin sonuna kadar bekler", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T12:00:00.000Z"));
    const pendingConnection = deferred();
    const room = { ...ROOM, expiresAt: "2026-08-14T12:05:00.000Z" };
    const signaling = { createRoom: vi.fn().mockResolvedValue(room) };
    const peer = {
      connect: vi.fn(() => pendingConnection.promise),
      getVerificationPhrase: vi.fn(),
      close: vi.fn(),
    };

    render(<NearbyTransferPanel
      mode="send"
      user={{ id: "user-1", plan: "standard" }}
      signaling={signaling}
      peerSessionFactory={() => peer}
      reserveActivity={async () => ({ id: "reservation-1" })}
      completeActivity={async () => ({ id: "reservation-1" })}
    />);

    fireEvent.change(screen.getByLabelText("Yakındaki cihaza gönderilecek dosya"), {
      target: { files: [new File(["abc"], "rapor.txt", { type: "text/plain" })] },
    });

    await flushMicrotasks();
    expect(screen.getByRole("button", { name: "Bağlantı davetini kopyala" })).toBeInTheDocument();
    expect(screen.getByLabelText("Davet için kalan süre")).toHaveTextContent("05:00");
    const connectOptions = peer.connect.mock.calls[0][0];
    expect(connectOptions.timeoutMs).toBeGreaterThan(295_000);
    expect(connectOptions.timeoutMs).toBeLessThanOrEqual(300_000);
    expect(connectOptions.signal).toBeInstanceOf(AbortSignal);
  });

  it("daveti iptal edince kaynağı ve rezervasyonu bir kez kapatır, eski sonucu yok sayar", async () => {
    const pendingConnection = deferred();
    const completeActivity = vi.fn().mockResolvedValue({ id: "reservation-1" });
    const peer = {
      connect: vi.fn(() => pendingConnection.promise),
      getVerificationPhrase: vi.fn().mockResolvedValue("Eski İfade · Eski Martı"),
      close: vi.fn(),
    };
    render(<NearbyTransferPanel
      mode="send"
      user={{ id: "user-1", plan: "standard" }}
      signaling={{ createRoom: vi.fn().mockResolvedValue(ROOM) }}
      peerSessionFactory={() => peer}
      reserveActivity={async () => ({ id: "reservation-1" })}
      completeActivity={completeActivity}
    />);

    fireEvent.change(screen.getByLabelText("Yakındaki cihaza gönderilecek dosya"), {
      target: { files: [new File(["abc"], "rapor.txt", { type: "text/plain" })] },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Daveti iptal et" }));

    await waitFor(() => expect(completeActivity).toHaveBeenCalledTimes(1));
    expect(completeActivity).toHaveBeenCalledWith(expect.objectContaining({
      reservationId: "reservation-1",
      status: "failed",
    }));
    expect(peer.close).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("ABC234")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bağlantı davetini kopyala" })).not.toBeInTheDocument();

    await act(async () => {
      pendingConnection.resolve(channel());
      await pendingConnection.promise;
    });

    expect(peer.getVerificationPhrase).not.toHaveBeenCalled();
    expect(screen.queryByText("Eski İfade · Eski Martı")).not.toBeInTheDocument();
    expect(peer.close).toHaveBeenCalledTimes(1);
    expect(completeActivity).toHaveBeenCalledTimes(1);
  });

  it("davet süresi dolunca kaynağı kapatır, rezervasyonu iade eder ve dosyayı temizler", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T12:00:00.000Z"));
    const completeActivity = vi.fn().mockResolvedValue({ id: "reservation-1" });
    const peer = {
      connect: vi.fn(() => new Promise(() => {})),
      getVerificationPhrase: vi.fn(),
      close: vi.fn(),
    };
    render(<NearbyTransferPanel
      mode="send"
      user={{ id: "user-1", plan: "standard" }}
      signaling={{ createRoom: vi.fn().mockResolvedValue({
        ...ROOM,
        expiresAt: "2026-08-14T12:00:01.000Z",
      }) }}
      peerSessionFactory={() => peer}
      reserveActivity={async () => ({ id: "reservation-1" })}
      completeActivity={completeActivity}
      onVaultDrop={vi.fn()}
    />);

    fireEvent.change(screen.getByLabelText("Yakındaki cihaza gönderilecek dosya"), {
      target: { files: [new File(["abc"], "rapor.txt", { type: "text/plain" })] },
    });
    await flushMicrotasks();
    expect(screen.getByRole("button", { name: "Daveti iptal et" })).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_250);
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Davet süresi doldu. Yeni davet oluştur.");
    expect(peer.close).toHaveBeenCalledTimes(1);
    expect(completeActivity).toHaveBeenCalledTimes(1);
    expect(completeActivity).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
    expect(screen.queryByText("ABC234")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "VaultDrop ile devam et" })).not.toBeInTheDocument();
  });

  it("eski bağlantı sonucu yeni davetin kodunu ve durumunu değiştirmez", async () => {
    const firstConnection = deferred();
    const secondConnection = deferred();
    const rooms = [
      { ...ROOM, code: "ABC234" },
      { ...ROOM, code: "DEF567" },
    ];
    const firstPeer = {
      connect: vi.fn(() => firstConnection.promise),
      getVerificationPhrase: vi.fn().mockResolvedValue("Eski İfade · Eski Martı"),
      close: vi.fn(),
    };
    const secondPeer = {
      connect: vi.fn(() => secondConnection.promise),
      getVerificationPhrase: vi.fn().mockResolvedValue("Yeni İfade · Yeni Martı"),
      close: vi.fn(),
    };
    const signaling = { createRoom: vi.fn().mockImplementation(async () => rooms.shift()) };
    render(<NearbyTransferPanel
      mode="send"
      user={{ id: "user-1", plan: "standard" }}
      signaling={signaling}
      peerSessionFactory={vi.fn()
        .mockImplementationOnce(() => firstPeer)
        .mockImplementationOnce(() => secondPeer)}
      reserveActivity={vi.fn()
        .mockResolvedValueOnce({ id: "reservation-1" })
        .mockResolvedValueOnce({ id: "reservation-2" })}
      completeActivity={vi.fn().mockResolvedValue({})}
    />);
    const picker = screen.getByLabelText("Yakındaki cihaza gönderilecek dosya");

    fireEvent.change(picker, { target: { files: [new File(["ilk"], "ilk.txt")] } });
    fireEvent.click(await screen.findByRole("button", { name: "Daveti iptal et" }));
    fireEvent.change(picker, { target: { files: [new File(["yeni"], "yeni.txt")] } });
    expect(await screen.findByText("DEF567")).toBeInTheDocument();

    await act(async () => {
      firstConnection.resolve(channel());
      await firstConnection.promise;
    });

    expect(screen.getByText("DEF567")).toBeInTheDocument();
    expect(screen.queryByText("ABC234")).not.toBeInTheDocument();
    expect(screen.queryByText("Eski İfade · Eski Martı")).not.toBeInTheDocument();
    expect(firstPeer.getVerificationPhrase).not.toHaveBeenCalled();
    expect(secondPeer.connect.mock.calls[0][0].signal.aborted).toBe(false);
  });

  it("geçersiz oda süresinde bağlantıyı başlatmadan güvenli hata durumuna geçer", async () => {
    const peer = { connect: vi.fn(), close: vi.fn() };
    const peerSessionFactory = vi.fn(() => peer);
    const completeActivity = vi.fn().mockResolvedValue({ id: "reservation-1" });
    render(<NearbyTransferPanel
      mode="send"
      user={{ id: "user-1", plan: "standard" }}
      signaling={{ createRoom: vi.fn().mockResolvedValue({ ...ROOM, expiresAt: "geçersiz" }) }}
      peerSessionFactory={peerSessionFactory}
      reserveActivity={async () => ({ id: "reservation-1" })}
      completeActivity={completeActivity}
    />);

    fireEvent.change(screen.getByLabelText("Yakındaki cihaza gönderilecek dosya"), {
      target: { files: [new File(["abc"], "rapor.txt")] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("Davet süresi geçersiz. Yeni davet oluştur.");
    expect(peerSessionFactory).toHaveBeenCalledTimes(1);
    expect(peer.connect).not.toHaveBeenCalled();
    expect(peer.close).toHaveBeenCalledTimes(1);
    expect(completeActivity).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("ABC234")).not.toBeInTheDocument();
  });

  it("alıcı kodla bağlanır, dosya teklifini görür ve kabul eder", async () => {
    const dataChannel = channel();
    const signaling = { joinRoom: vi.fn().mockResolvedValue(ROOM), close: vi.fn() };
    const peer = {
      connect: vi.fn().mockResolvedValue(dataChannel),
      getVerificationPhrase: vi.fn().mockResolvedValue("Mavi Kale · Sakin Martı"),
      close: vi.fn(),
    };
    let listener;
    const receiver = {
      subscribe: vi.fn((next) => {
        listener = next;
        return () => {};
      }),
      accept: vi.fn(),
      reject: vi.fn(),
      result: vi.fn(() => new Promise(() => {})),
      close: vi.fn(),
    };
    render(<NearbyTransferPanel
      mode="receive"
      signaling={signaling}
      peerSessionFactory={() => peer}
      reserveActivity={async () => ({ id: "reservation-1" })}
      completeActivity={async () => ({ id: "reservation-1" })}
      receiveControllerFactory={() => receiver}
    />);

    fireEvent.change(screen.getByLabelText("Yakındaki cihaz kodu"), { target: { value: "abc234" } });
    fireEvent.click(screen.getByRole("button", { name: "Bağlan" }));
    expect(await screen.findByText("Mavi Kale · Sakin Martı")).toBeInTheDocument();
    expect(peer.connect).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 15_000 }));
    fireEvent.click(screen.getByRole("button", { name: /İfadeler aynı/i }));
    dataChannel.receive("VDN1|VERIFIED");
    await waitFor(() => expect(receiver.subscribe).toHaveBeenCalled());
    act(() => listener({ state: "offered", file: { name: "rapor.xlsx", size: 1024, mime: "application/xlsx" } }));

    expect(await screen.findByText("rapor.xlsx")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dosyayı kabul et" }));
    expect(receiver.accept).toHaveBeenCalledTimes(1);
  });

  it("gönderici bağlantı zaman aşımını dolmuş davet olarak temizler", async () => {
    const error = Object.assign(new Error("Bağlanamadı"), { code: "DIRECT_CONNECTION_TIMEOUT" });
    const signaling = { createRoom: vi.fn().mockResolvedValue(ROOM) };
    const peer = { connect: vi.fn().mockRejectedValue(error), close: vi.fn() };
    render(<NearbyTransferPanel
      mode="send"
      user={{ id: "user-1", plan: "standard" }}
      signaling={signaling}
      peerSessionFactory={() => peer}
      reserveActivity={async () => ({ id: "reservation-1" })}
      completeActivity={async () => ({ id: "reservation-1" })}
      onVaultDrop={vi.fn()}
    />);

    fireEvent.change(screen.getByLabelText("Yakındaki cihaza gönderilecek dosya"), {
      target: { files: [new File(["abc"], "rapor.txt", { type: "text/plain" })] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("Davet süresi doldu. Yeni davet oluştur.");
    expect(peer.close).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "VaultDrop ile devam et" })).not.toBeInTheDocument();
    expect(screen.queryByText("ABC234")).not.toBeInTheDocument();
  });

  it("alıcı bağlantı zaman aşımında güvenli VaultDrop önerisini gösterir", async () => {
    const rawMessage = "HAM AĞ AYRINTISI: bağlantı reddedildi";
    const error = Object.assign(new Error(rawMessage), { code: "DIRECT_CONNECTION_TIMEOUT" });
    const signaling = { joinRoom: vi.fn().mockResolvedValue(ROOM) };
    const peer = { connect: vi.fn().mockRejectedValue(error), close: vi.fn() };
    render(<NearbyTransferPanel
      mode="receive"
      initialCode="ABC234"
      signaling={signaling}
      peerSessionFactory={() => peer}
    />);

    fireEvent.click(screen.getByRole("button", { name: "Bağlan" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "Doğrudan bağlantı 15 saniyede kurulamadı. Bu ağda VaultDrop kullan.",
    );
    expect(alert).not.toHaveTextContent(rawMessage);
  });

  it("360 px genişlikte ana eylemler tam genişliğe iner", () => {
    render(<NearbyTransferPanel mode="receive" signaling={{}} />);
    const panel = screen.getByTestId("nearby-transfer-panel");
    expect(panel).toHaveClass("nearby-transfer-panel");
    expect(screen.getByRole("button", { name: "Bağlan" })).toHaveClass("nearby-primary-action");
    fireEvent.change(screen.getByLabelText("Yakındaki cihaz kodu"), { target: { value: "ABC234" } });
  });

  it("ekrandan ayrılınca bağlantıyı ve alıcıyı kapatır", async () => {
    const dataChannel = channel();
    const signaling = { joinRoom: vi.fn().mockResolvedValue(ROOM) };
    const peer = {
      connect: vi.fn().mockResolvedValue(dataChannel),
      getVerificationPhrase: vi.fn().mockResolvedValue("Mavi Kale · Sakin Martı"),
      close: vi.fn(),
    };
    const receiver = {
      subscribe: vi.fn(() => () => {}), result: vi.fn(() => new Promise(() => {})), close: vi.fn(),
    };
    const view = render(<NearbyTransferPanel
      mode="receive" signaling={signaling} peerSessionFactory={() => peer}
      receiveControllerFactory={() => receiver}
    />);
    fireEvent.change(screen.getByLabelText("Yakındaki cihaz kodu"), { target: { value: "ABC234" } });
    fireEvent.click(screen.getByRole("button", { name: "Bağlan" }));
    await waitFor(() => expect(peer.connect).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole("button", { name: "İfadeler aynı, devam et" }));
    dataChannel.receive("VDN1|VERIFIED");
    await waitFor(() => expect(receiver.subscribe).toHaveBeenCalled());
    view.unmount();

    expect(peer.close).toHaveBeenCalled();
    expect(receiver.close).toHaveBeenCalled();
  });

  it("oda oluşturma kaldırmadan sonra tamamlanırsa odayı peer üzerinden kapatır", async () => {
    const pendingRoom = deferred();
    const completeActivity = vi.fn().mockResolvedValue({ id: "reservation-1" });
    const peer = { connect: vi.fn(), close: vi.fn().mockResolvedValue() };
    const peerSessionFactory = vi.fn(() => peer);
    const view = render(<NearbyTransferPanel
      mode="send"
      user={{ id: "user-1", plan: "standard" }}
      signaling={{ createRoom: vi.fn(() => pendingRoom.promise) }}
      peerSessionFactory={peerSessionFactory}
      reserveActivity={async () => ({ id: "reservation-1" })}
      completeActivity={completeActivity}
    />);

    fireEvent.change(screen.getByLabelText("Yakındaki cihaza gönderilecek dosya"), {
      target: { files: [new File(["abc"], "rapor.txt")] },
    });
    await flushMicrotasks();
    view.unmount();

    await act(async () => {
      pendingRoom.resolve(ROOM);
      await pendingRoom.promise;
      await Promise.resolve();
    });

    expect(peerSessionFactory).toHaveBeenCalledWith(expect.objectContaining({
      role: "host",
      code: "ABC234",
      token: "secret",
    }));
    expect(peer.connect).not.toHaveBeenCalled();
    expect(peer.close).toHaveBeenCalledTimes(1);
    expect(completeActivity).toHaveBeenCalledTimes(1);
  });

  it("rezervasyon sonlandırma reddedilirse hatayı yutar ve sonraki unmount aynı rezervasyonu yeniden dener", async () => {
    const completeActivity = vi.fn()
      .mockRejectedValueOnce(new Error("Geçici kayıt hatası"))
      .mockResolvedValueOnce({ id: "reservation-1" });
    const peer = {
      connect: vi.fn(() => new Promise(() => {})),
      getVerificationPhrase: vi.fn(),
      close: vi.fn(),
    };
    const view = render(<NearbyTransferPanel
      mode="send"
      user={{ id: "user-1", plan: "standard" }}
      signaling={{ createRoom: vi.fn().mockResolvedValue(ROOM) }}
      peerSessionFactory={() => peer}
      reserveActivity={async () => ({ id: "reservation-1" })}
      completeActivity={completeActivity}
    />);

    fireEvent.change(screen.getByLabelText("Yakındaki cihaza gönderilecek dosya"), {
      target: { files: [new File(["abc"], "rapor.txt")] },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Daveti iptal et" }));
    await waitFor(() => expect(completeActivity).toHaveBeenCalledTimes(1));
    await flushMicrotasks();

    view.unmount();

    await waitFor(() => expect(completeActivity).toHaveBeenCalledTimes(2));
    expect(completeActivity.mock.calls[0][0]).toMatchObject({
      reservationId: "reservation-1",
      status: "failed",
    });
    expect(completeActivity.mock.calls[1][0]).toMatchObject({
      reservationId: "reservation-1",
      status: "failed",
    });
  });

  it("eşzamanlı iptal ve unmount aynı rezervasyon için tek sonlandırma isteği üretir", async () => {
    const pendingCompletion = deferred();
    const completeActivity = vi.fn(() => pendingCompletion.promise);
    const peer = {
      connect: vi.fn(() => new Promise(() => {})),
      getVerificationPhrase: vi.fn(),
      close: vi.fn(),
    };
    const view = render(<NearbyTransferPanel
      mode="send"
      user={{ id: "user-1", plan: "standard" }}
      signaling={{ createRoom: vi.fn().mockResolvedValue(ROOM) }}
      peerSessionFactory={() => peer}
      reserveActivity={async () => ({ id: "reservation-1" })}
      completeActivity={completeActivity}
    />);

    fireEvent.change(screen.getByLabelText("Yakındaki cihaza gönderilecek dosya"), {
      target: { files: [new File(["abc"], "rapor.txt")] },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Daveti iptal et" }));
    view.unmount();

    await flushMicrotasks();
    expect(completeActivity).toHaveBeenCalledTimes(1);
    await act(async () => {
      pendingCompletion.resolve({ id: "reservation-1" });
      await pendingCompletion.promise;
    });
    expect(completeActivity).toHaveBeenCalledTimes(1);
  });

  it("ikinci alıcının kullanılmış davet hatası ilk alıcının bağlantısını kapatmaz", async () => {
    const firstPeer = {
      connect: vi.fn().mockResolvedValue(channel()),
      getVerificationPhrase: vi.fn().mockResolvedValue("Mavi Kale · Sakin Martı"),
      close: vi.fn(),
    };
    const firstReceiver = {
      subscribe: vi.fn(() => () => {}),
      result: vi.fn(() => new Promise(() => {})),
      close: vi.fn(),
    };
    const firstView = render(<NearbyTransferPanel
      mode="receive"
      initialCode="ABC234"
      signaling={{ joinRoom: vi.fn().mockResolvedValue(ROOM) }}
      peerSessionFactory={() => firstPeer}
      receiveControllerFactory={() => firstReceiver}
    />);
    fireEvent.click(within(firstView.getByTestId("nearby-transfer-panel")).getByRole("button", { name: "Bağlan" }));
    expect(await firstView.findByText("Mavi Kale · Sakin Martı")).toBeInTheDocument();

    const secondError = Object.assign(new Error("Bu odaya başka bir cihaz bağlanmış."), {
      code: "ROOM_ALREADY_JOINED",
    });
    const secondView = render(<NearbyTransferPanel
      mode="receive"
      initialCode="ABC234"
      signaling={{ joinRoom: vi.fn().mockRejectedValue(secondError) }}
    />);
    const panels = secondView.getAllByTestId("nearby-transfer-panel");
    fireEvent.click(within(panels[1]).getByRole("button", { name: "Bağlan" }));

    expect(await within(panels[1]).findByRole("alert")).toHaveTextContent("Bu davet daha önce kullanılmış.");
    expect(firstPeer.close).not.toHaveBeenCalled();
    expect(within(panels[0]).getByText("Mavi Kale · Sakin Martı")).toBeInTheDocument();
  });

  it.each([
    ["sender", "receiver"],
    ["receiver", "sender"],
  ])("%s önce, %s sonra onayladığında gerçek kanal uçlarında dosya teklifi kaybolmaz", async (first, second) => {
    const { host, guest } = linkedChannels();
    const sha256 = "A".repeat(43);
    const hostPeer = {
      connect: vi.fn().mockResolvedValue(host),
      getVerificationPhrase: vi.fn().mockResolvedValue("Mavi Kale · Sakin Martı"),
      close: vi.fn(),
    };
    const guestPeer = {
      connect: vi.fn().mockResolvedValue(guest),
      getVerificationPhrase: vi.fn().mockResolvedValue("Mavi Kale · Sakin Martı"),
      close: vi.fn(),
    };
    const completeActivity = vi.fn().mockResolvedValue({ id: "reservation-1" });
    render(<>
      <NearbyTransferPanel
        mode="send"
        user={{ id: "user-1", plan: "standard" }}
        signaling={{ createRoom: vi.fn().mockResolvedValue(ROOM) }}
        peerSessionFactory={() => hostPeer}
        sendControllerFactory={({ channel: dataChannel }) => createNearbySendController({
          channel: dataChannel,
          hashFile: vi.fn().mockResolvedValue(sha256),
          createTransferId: () => "abcdefghijklmnop",
        })}
        reserveActivity={vi.fn().mockResolvedValue({ id: "reservation-1" })}
        completeActivity={completeActivity}
      />
      <NearbyTransferPanel
        mode="receive"
        initialCode="ABC234"
        signaling={{ joinRoom: vi.fn().mockResolvedValue({ ...ROOM, token: "guest-token" }) }}
        peerSessionFactory={() => guestPeer}
        receiveControllerFactory={({ channel: dataChannel }) => createNearbyReceiveController({
          channel: dataChannel,
          hashBytes: vi.fn().mockResolvedValue(sha256),
        })}
        recordReceive={vi.fn().mockResolvedValue({})}
      />
    </>);
    const panels = screen.getAllByTestId("nearby-transfer-panel");
    const senderPanel = within(panels[0]);
    const receiverPanel = within(panels[1]);
    const file = new File([new Uint8Array([1, 2, 3])], "rapor.txt", { type: "text/plain" });
    if (first === "sender") {
      fireEvent.change(senderPanel.getByLabelText("Yakındaki cihaza gönderilecek dosya"), {
        target: { files: [file] },
      });
      fireEvent.click(await senderPanel.findByRole("button", { name: "İfadeler aynı, devam et" }));
      fireEvent.click(receiverPanel.getByRole("button", { name: "Bağlan" }));
      expect(await receiverPanel.findByText("Mavi Kale · Sakin Martı")).toBeInTheDocument();
    } else {
      fireEvent.click(receiverPanel.getByRole("button", { name: "Bağlan" }));
      fireEvent.click(await receiverPanel.findByRole("button", { name: "İfadeler aynı, devam et" }));
      fireEvent.change(senderPanel.getByLabelText("Yakındaki cihaza gönderilecek dosya"), {
        target: { files: [file] },
      });
      expect(await senderPanel.findByText("Mavi Kale · Sakin Martı")).toBeInTheDocument();
    }
    await flushMicrotasks();
    expect(receiverPanel.queryByText("rapor.txt")).not.toBeInTheDocument();

    const panelsByRole = { sender: senderPanel, receiver: receiverPanel };
    fireEvent.click(panelsByRole[second].getByRole("button", { name: "İfadeler aynı, devam et" }));

    expect(await receiverPanel.findByText("rapor.txt")).toBeInTheDocument();
    fireEvent.click(receiverPanel.getByRole("button", { name: "Dosyayı kabul et" }));
    expect(await senderPanel.findByText("Dosya gönderildi.")).toBeInTheDocument();
    expect(completeActivity).toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
  });

  it("uzak doğrulama beklerken ekran kapanırsa geç VERIFIED mesajı controller başlatmaz", async () => {
    const { host, guest } = linkedChannels();
    const sendControllerFactory = vi.fn();
    const peer = {
      connect: vi.fn().mockResolvedValue(host),
      getVerificationPhrase: vi.fn().mockResolvedValue("Mavi Kale · Sakin Martı"),
      close: vi.fn(),
    };
    const view = render(<NearbyTransferPanel
      mode="send"
      user={{ id: "user-1", plan: "standard" }}
      signaling={{ createRoom: vi.fn().mockResolvedValue(ROOM) }}
      peerSessionFactory={() => peer}
      sendControllerFactory={sendControllerFactory}
      reserveActivity={vi.fn().mockResolvedValue({ id: "reservation-1" })}
      completeActivity={vi.fn().mockResolvedValue({ id: "reservation-1" })}
    />);
    fireEvent.change(screen.getByLabelText("Yakındaki cihaza gönderilecek dosya"), {
      target: { files: [new File(["abc"], "rapor.txt")] },
    });
    fireEvent.click(await screen.findByRole("button", { name: "İfadeler aynı, devam et" }));
    view.unmount();

    guest.send("VDN1|VERIFIED");
    await flushMicrotasks();

    expect(sendControllerFactory).not.toHaveBeenCalled();
    expect(peer.close).toHaveBeenCalledTimes(1);
  });

  it.each(["send", "receive"])("%s tarafında yerel VERIFIED gönderimi başarısızsa oturumu kalıcı kapatır", async (mode) => {
    const rawMessage = "HAM VERİ KANALI GÖNDERİM HATASI";
    const dataChannel = channel();
    dataChannel.send = vi.fn(() => {
      throw new Error(rawMessage);
    });
    const peer = {
      connect: vi.fn().mockResolvedValue(dataChannel),
      getVerificationPhrase: vi.fn().mockResolvedValue("Mavi Kale · Sakin Martı"),
      close: vi.fn(),
    };
    const sendControllerFactory = vi.fn();
    const receiveControllerFactory = vi.fn();
    const completeActivity = vi.fn().mockResolvedValue({ id: "reservation-1" });
    const props = mode === "send"
      ? {
          mode,
          user: { id: "user-1", plan: "standard" },
          signaling: { createRoom: vi.fn().mockResolvedValue(ROOM) },
          reserveActivity: vi.fn().mockResolvedValue({ id: "reservation-1" }),
          completeActivity,
        }
      : {
          mode,
          initialCode: "ABC234",
          signaling: { joinRoom: vi.fn().mockResolvedValue(ROOM) },
        };
    render(<NearbyTransferPanel
      {...props}
      peerSessionFactory={() => peer}
      sendControllerFactory={sendControllerFactory}
      receiveControllerFactory={receiveControllerFactory}
    />);
    if (mode === "send") {
      fireEvent.change(screen.getByLabelText("Yakındaki cihaza gönderilecek dosya"), {
        target: { files: [new File(["abc"], "rapor.txt")] },
      });
    } else {
      fireEvent.click(screen.getByRole("button", { name: "Bağlan" }));
    }

    fireEvent.click(await screen.findByRole("button", { name: "İfadeler aynı, devam et" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Doğrulama onayı gönderilemedi. Bağlantı güvenlik için kapatıldı.",
    );
    expect(screen.queryByText(rawMessage)).not.toBeInTheDocument();
    expect(screen.queryByText("Mavi Kale · Sakin Martı")).not.toBeInTheDocument();
    expect(peer.close).toHaveBeenCalledTimes(1);

    dataChannel.receive("VDN1|VERIFIED");
    await flushMicrotasks();
    expect(sendControllerFactory).not.toHaveBeenCalled();
    expect(receiveControllerFactory).not.toHaveBeenCalled();
    if (mode === "send") {
      await waitFor(() => expect(completeActivity).toHaveBeenCalledTimes(1));
      expect(completeActivity).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
    }
  });

  it.each(["send", "receive"])("%s tarafında VERIFIED yankısı başarısızsa duplicate mesaj controller başlatmaz", async (mode) => {
    const rawMessage = "HAM VERIFIED YANKI HATASI";
    const dataChannel = channel();
    dataChannel.send = vi.fn()
      .mockImplementationOnce((value) => dataChannel.sent.push(value))
      .mockImplementationOnce(() => {
        throw new Error(rawMessage);
      });
    const peer = {
      connect: vi.fn().mockResolvedValue(dataChannel),
      getVerificationPhrase: vi.fn().mockResolvedValue("Mavi Kale · Sakin Martı"),
      close: vi.fn(),
    };
    const sendControllerFactory = vi.fn();
    const receiveControllerFactory = vi.fn();
    const completeActivity = vi.fn().mockResolvedValue({ id: "reservation-1" });
    const props = mode === "send"
      ? {
          mode,
          user: { id: "user-1", plan: "standard" },
          signaling: { createRoom: vi.fn().mockResolvedValue(ROOM) },
          reserveActivity: vi.fn().mockResolvedValue({ id: "reservation-1" }),
          completeActivity,
        }
      : {
          mode,
          initialCode: "ABC234",
          signaling: { joinRoom: vi.fn().mockResolvedValue(ROOM) },
        };
    render(<NearbyTransferPanel
      {...props}
      peerSessionFactory={() => peer}
      sendControllerFactory={sendControllerFactory}
      receiveControllerFactory={receiveControllerFactory}
    />);
    if (mode === "send") {
      fireEvent.change(screen.getByLabelText("Yakındaki cihaza gönderilecek dosya"), {
        target: { files: [new File(["abc"], "rapor.txt")] },
      });
    } else {
      fireEvent.click(screen.getByRole("button", { name: "Bağlan" }));
    }
    fireEvent.click(await screen.findByRole("button", { name: "İfadeler aynı, devam et" }));

    act(() => dataChannel.receive("VDN1|VERIFIED"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Doğrulama onayı gönderilemedi. Bağlantı güvenlik için kapatıldı.",
    );
    expect(screen.queryByText(rawMessage)).not.toBeInTheDocument();
    expect(peer.close).toHaveBeenCalledTimes(1);

    act(() => dataChannel.receive("VDN1|VERIFIED"));
    await flushMicrotasks();
    expect(sendControllerFactory).not.toHaveBeenCalled();
    expect(receiveControllerFactory).not.toHaveBeenCalled();
    if (mode === "send") {
      await waitFor(() => expect(completeActivity).toHaveBeenCalledTimes(1));
      expect(completeActivity).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
    }
  });

  it.each(["send", "receive"])("%s tarafında farklı doğrulama ifadesi bağlantıyı güvenle kapatır", async (mode) => {
    const completeActivity = vi.fn().mockResolvedValue({ id: "reservation-1" });
    const peer = {
      connect: vi.fn().mockResolvedValue(channel()),
      getVerificationPhrase: vi.fn().mockResolvedValue("Mavi Kale · Sakin Martı"),
      close: vi.fn(),
    };
    const sender = { send: vi.fn() };
    const receiver = {
      subscribe: vi.fn(() => () => {}),
      result: vi.fn(() => new Promise(() => {})),
      close: vi.fn(),
    };
    const sendControllerFactory = vi.fn(() => sender);
    const receiveControllerFactory = vi.fn(() => receiver);
    const props = mode === "send"
      ? {
          mode,
          user: { id: "user-1", plan: "standard" },
          signaling: { createRoom: vi.fn().mockResolvedValue(ROOM) },
          reserveActivity: vi.fn().mockResolvedValue({ id: "reservation-1" }),
          completeActivity,
        }
      : {
          mode,
          initialCode: "ABC234",
          signaling: { joinRoom: vi.fn().mockResolvedValue(ROOM) },
        };
    render(<NearbyTransferPanel
      {...props}
      peerSessionFactory={() => peer}
      sendControllerFactory={sendControllerFactory}
      receiveControllerFactory={receiveControllerFactory}
    />);

    if (mode === "send") {
      fireEvent.change(screen.getByLabelText("Yakındaki cihaza gönderilecek dosya"), {
        target: { files: [new File(["abc"], "rapor.txt")] },
      });
    } else {
      fireEvent.click(screen.getByRole("button", { name: "Bağlan" }));
    }
    expect(await screen.findByText("Mavi Kale · Sakin Martı")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "İfadeler farklı, bağlantıyı kapat" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Doğrulama ifadeleri eşleşmedi. Bağlantı güvenlik için kapatıldı.",
    );
    expect(peer.close).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Mavi Kale · Sakin Martı")).not.toBeInTheDocument();
    expect(screen.queryByText("ABC234")).not.toBeInTheDocument();
    expect(sendControllerFactory).not.toHaveBeenCalled();
    expect(receiveControllerFactory).not.toHaveBeenCalled();
    if (mode === "send") {
      await waitFor(() => expect(completeActivity).toHaveBeenCalledTimes(1));
      expect(completeActivity).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
    }
  });
});
