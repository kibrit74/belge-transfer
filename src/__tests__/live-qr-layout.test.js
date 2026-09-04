import { describe, expect, it } from 'vitest';
import { selectLiveQrLayout } from '../live-qr/layout.js';

describe('Canlı QR ekran yerleşimi', () => {
  it.each([
    [{ width: 390, height: 844, devicePixelRatio: 3, moduleCount: 141 }, { supported: true, count: 1 }],
    [{ width: 900, height: 700, devicePixelRatio: 1, moduleCount: 141 }, { supported: true, count: 2 }],
    [{ width: 1600, height: 900, devicePixelRatio: 1, moduleCount: 141 }, { supported: true, count: 4 }],
    [{ width: 280, height: 500, devicePixelRatio: 1, moduleCount: 141 }, { supported: false }],
  ])('%o ekranında güvenli hücre boyutunu korur', (viewport, expected) => {
    expect(selectLiveQrLayout(viewport)).toMatchObject(expected);
  });

  it('üç fiziksel pikseli korurken kareyi gereğinden büyük tutmaz', () => {
    expect(selectLiveQrLayout({
      width: 430,
      height: 800,
      devicePixelRatio: 1,
      moduleCount: 100,
    })).toMatchObject({ supported: true, qrCssSize: 312 });
  });

  it('geniş ekranda Canlı QR karelerini rahat okunabilir üst boyutta tutar', () => {
    expect(selectLiveQrLayout({
      width: 1_600,
      height: 1_400,
      devicePixelRatio: 1,
      moduleCount: 100,
    })).toMatchObject({ supported: true, count: 4, qrCssSize: 312 });
  });

  it('sessiz alan dahil üç fiziksel piksele sığmayan QR düzenini reddeder', () => {
    expect(selectLiveQrLayout({
      width: 450,
      height: 800,
      devicePixelRatio: 1,
      moduleCount: 141,
    })).toMatchObject({ supported: false });
  });

  it('profil üst sınırı bir olduğunda geniş ekranda da tek QR yerleştirir', () => {
    expect(selectLiveQrLayout({
      width: 1600,
      height: 900,
      devicePixelRatio: 1,
      moduleCount: 141,
      maxCount: 1,
    })).toMatchObject({ supported: true, count: 1, columns: 1, rows: 1 });
  });
});
