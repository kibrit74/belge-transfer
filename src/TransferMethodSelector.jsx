import { TRANSFER_METHODS } from "./transfer/method-registry.js";

export default function TransferMethodSelector({ activeMethod, onChange, disabledMethods = [], methods = TRANSFER_METHODS }) {
  return (
    <section className="transfer-route-picker" aria-labelledby="send-route-title">
      <header className="transfer-route-heading">
        <span className="eyebrow">● GÖNDERİM YOLU</span>
        <h2 id="send-route-title">Alıcı nerede?</h2>
        <p>Yan yanaysa Canlı QR, aynı ağdaysa Yakındaki Cihazlar, uzaktaysa VaultDrop seç.</p>
      </header>

      <div className="transfer-route-grid" aria-label="Aktarım yöntemi">
        {methods.map((method) => {
          const disabled = disabledMethods.includes(method.id);
          return (
            <button
              key={method.id}
              type="button"
              className={activeMethod === method.id ? "transfer-route-option active" : "transfer-route-option"}
              aria-pressed={activeMethod === method.id}
              disabled={disabled}
              onClick={() => onChange(method.id)}
            >
              {method.id === "package" && <span className="transfer-route-badge">Önerilen</span>}
              {disabled && <span className="transfer-route-badge">Yakında</span>}
              <span className="transfer-route-title">{method.title}</span>
              <span className="transfer-route-description">{method.sendDescription}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
