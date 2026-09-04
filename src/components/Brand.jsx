export default function Brand({ compact = false }) {
  return (
    <span className={compact ? "brand brand-compact" : "brand"}>
      <img src="/brand/vaultdrop-mark.png" alt="" />
      <span>
        Vault<strong>Drop</strong>
      </span>
    </span>
  );
}
