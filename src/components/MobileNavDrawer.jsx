export default function MobileNavDrawer({ open, user, onClose }) {
  if (!open) return null;

  const transferHref = "/transfer";

  return (
    <div className="mobile-nav-layer">
      <button
        type="button"
        className="mobile-nav-backdrop"
        data-testid="mobile-nav-backdrop"
        aria-label="Menüyü kapat"
        onClick={onClose}
      />
      <aside className="mobile-nav-drawer" id="mobile-navigation" role="dialog" aria-label="Mobil menü" aria-modal="true">
        <div className="mobile-nav-heading">
          <span>Menü</span>
          <button type="button" className="mobile-nav-close" aria-label="Menüyü kapat" onClick={onClose}>×</button>
        </div>
        <nav className="mobile-nav-links" aria-label="Mobil navigasyon">
          <a href="/" onClick={onClose}><span>Ana sayfa</span><b>›</b></a>
          <a href="/#demo" onClick={onClose}><span>Nasıl Çalışır?</span><b>›</b></a>
          <a href="/#features" onClick={onClose}><span>Özellikler</span><b>›</b></a>
          <a href="/paketler" onClick={onClose}><span>Paketler</span><b>›</b></a>
          <a href="/sss" onClick={onClose}><span>SSS</span><b>›</b></a>
        </nav>
        <div className="mobile-nav-account">
          {user ? (
            <a href="/profil" aria-label="Profilim" onClick={onClose}>
              <span className="mobile-account-avatar">{user.avatarUrl ? <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" /> : user.displayName.slice(0, 1)}</span>
              <span><small>HESABIM</small><strong>Profilim</strong></span>
            </a>
          ) : (
            <a href="/giris" aria-label="Giriş yap" onClick={onClose}>
              <span className="mobile-account-avatar">→</span>
              <span><small>VAULTDROP HESABI</small><strong>Giriş yap</strong></span>
            </a>
          )}
        </div>
        <a className="mobile-nav-cta" href={transferHref} onClick={onClose}>Aktarıma başla <span>↗</span></a>
      </aside>
    </div>
  );
}
