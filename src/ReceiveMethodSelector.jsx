import { TRANSFER_METHODS } from "./transfer/method-registry.js";

export default function ReceiveMethodSelector({ activeMethod, onChange, disabledMethods = [], methods = TRANSFER_METHODS }) {
  return (
    <section className="receive-route-picker" aria-labelledby="receive-route-title">
      <header className="transfer-route-heading">
        <span className="eyebrow">● ALIM YOLU</span>
        <h2 id="receive-route-title">Nasıl alacaksın?</h2>
        <p>Elindeki aktarım türünü seç; dosyayı bu cihazda doğrula ve aç.</p>
      </header>

      <div className="receive-route-grid" aria-label="Alım yöntemi">
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
              {disabled && <span className="transfer-route-badge">Yakında</span>}
              <span className="transfer-route-title">{method.receiveTitle}</span>
              <span className="transfer-route-description">{method.receiveDescription}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
