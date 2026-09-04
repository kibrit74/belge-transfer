import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TRANSFER_METHODS } from '../transfer/method-registry.js';

function readWorkspaceFile(relativePath) {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

describe('üç yöntemli güvenlik ve yayın sözleşmesi', () => {
  it('Canlı QR riskini açık, diğer iki yöntemi şifreli olarak tanımlar', () => {
    const methods = Object.fromEntries(TRANSFER_METHODS.map((method) => [method.id, method]));

    expect(methods.live).toMatchObject({
      encrypted: false, requiresCamera: true, requiresSameNetwork: false,
    });
    expect(methods.nearby).toMatchObject({
      encrypted: true, requiresCamera: false, requiresSameNetwork: true,
    });
    expect(methods.package).toMatchObject({
      encrypted: true, requiresCamera: false, requiresSameNetwork: false,
    });
  });

  it('deneysel kapıları örnek ortam dosyasında güvenli biçimde kapalı tutar', () => {
    const exampleEnvironment = readWorkspaceFile('.env.example');

    expect(exampleEnvironment).toContain('VITE_ENABLE_NEARBY=false');
    expect(exampleEnvironment).toContain('VITE_ENABLE_LIVE_QR_10MIB=false');
    expect(exampleEnvironment).toContain('VITE_ENABLE_LIVE_QR_FAST=false');
  });

  it('manuel test formunda gerçek özellik bayrağını kullanır ve kabul belgesini beklemede tutar', () => {
    const liveManual = readWorkspaceFile('docs/live-qr-10mib-manual-test.md');
    const acceptance = readWorkspaceFile('docs/three-method-acceptance-test.md');

    expect(liveManual).toContain('VITE_ENABLE_LIVE_QR_10MIB=true');
    expect(liveManual).not.toContain('VITE_ENABLE_LIVE_QR_10_MIB');
    expect(acceptance).toContain('Yayın durumu: **BEKLEMEDE**');
    expect(acceptance).toContain('Gerçek cihaz matrisleri tamamlanmadan');
  });

  it('Yakındaki Cihazlar belgelerinde davet, gizlilik ve güvenli yayın kapısını eksiksiz açıklar', () => {
    const readme = readWorkspaceFile('README.md');
    const nearbyManual = readWorkspaceFile('docs/nearby-devices-manual-test.md');
    const acceptance = readWorkspaceFile('docs/three-method-acceptance-test.md');
    const documents = `${readme}\n${nearbyManual}\n${acceptance}`;

    expect(documents).toContain('Davet bağlantısı ana akış');
    expect(documents).toContain('kısa kod yedek');
    expect(documents).toContain('tek kullanımlık');
    expect(documents).toContain('5 dakika');
    expect(documents).toContain('otomatik katılmaz');
    expect(documents).toContain('`Bağlan`');
    expect(documents).toContain('WebRTC veri kanalı');
    expect(documents).toContain('mesajlaşma kanalından');
    expect(documents).toContain("tanıştırma API'sinden");
    expect(documents).toContain('VITE_ENABLE_NEARBY=false');
    expect(documents).toContain('VaultDrop stabil yedek');
    expect(documents).toContain('QR Video ve renkli QR aktif ürün yöntemi değildir');
    expect(readme).toContain(
      "Token davet URL'sine konmaz; tanıştırma API'sine yalnız kimlik doğrulama başlığında gönderilir.",
    );
  });

  it('Yakındaki Cihazlar manuel matrisi davet kanallarını ve ölçüm alanlarını BEKLİYOR bırakır', () => {
    const nearbyManual = readWorkspaceFile('docs/nearby-devices-manual-test.md');

    expect(nearbyManual).toContain('Teams');
    expect(nearbyManual).toContain('WhatsApp Web');
    expect(nearbyManual).toContain('E-posta');
    expect(nearbyManual).toContain('Oda kurulma süresi');
    expect(nearbyManual).toContain('İfade eşleşmesi');
    expect(nearbyManual).toContain('Aktarım süresi');
    expect(nearbyManual).toContain('Dosya adı');
    expect(nearbyManual).toContain('Dosya boyutu');
    expect(nearbyManual).toContain('SHA sonucu');
    expect(nearbyManual).toContain('Windows Chrome → Windows Edge');
    expect(nearbyManual).toContain('Windows Chrome → macOS Safari');
    expect(nearbyManual).toContain('macOS Chrome → macOS Safari');
    expect(nearbyManual).not.toContain('PASS / FAIL');
    const mandatoryRows = nearbyManual
      .split('\n')
      .filter((line) => /Windows Chrome → Windows Edge|Windows Chrome → macOS Safari|macOS Chrome → macOS Safari/.test(line));
    expect(mandatoryRows).toHaveLength(27);
    expect(mandatoryRows.every((line) => /\|\s*BEKLİYOR\s*\|$/.test(line))).toBe(true);
  });

  it('aktif Yakındaki Cihazlar metinlerinde beş dakikalık oda süresini kullanır', () => {
    const panel = readWorkspaceFile('src/NearbyTransferPanel.jsx');
    const faq = readWorkspaceFile('src/content/faqContent.js');
    const activeProductCopy = `${panel}\n${faq}`;

    expect(activeProductCopy).not.toContain('3 dakika');
    expect(panel).toContain('Kod 5 dakika geçerlidir.');
    expect(faq).toContain('yalnız 5 dakika yaşayan oda');
  });
});
