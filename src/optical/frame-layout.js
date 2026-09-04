export function getQrRegions(profile) {
  if (!profile || !Number.isSafeInteger(profile.qrCount)) {
    throw new TypeError("Optik profil geçersiz.");
  }

  if (profile.qrCount === 1) {
    const size = Math.min(profile.width, profile.height);
    return [{
      x: Math.round((profile.width - size) / 2),
      y: Math.round((profile.height - size) / 2),
      size,
    }];
  }

  if (profile.qrCount === 2) {
    const size = Math.min(profile.height - 180, Math.floor(profile.width / 2) - 60);
    return [
      { x: 60, y: Math.round((profile.height - size) / 2), size },
      { x: profile.width - size - 60, y: Math.round((profile.height - size) / 2), size },
    ];
  }

  throw new RangeError("Bu sürüm en fazla iki QR bölgesini destekler.");
}

export function scaleQrRegions(profile, targetWidth, targetHeight) {
  if (!Number.isSafeInteger(targetWidth) || targetWidth < 1
    || !Number.isSafeInteger(targetHeight) || targetHeight < 1) {
    throw new TypeError("Hedef video boyutu geçersiz.");
  }

  const scaleX = targetWidth / profile.width;
  const scaleY = targetHeight / profile.height;

  return getQrRegions(profile).map((region) => ({
    x: Math.round(region.x * scaleX),
    y: Math.round(region.y * scaleY),
    width: Math.round(region.size * scaleX),
    height: Math.round(region.size * scaleY),
  }));
}
