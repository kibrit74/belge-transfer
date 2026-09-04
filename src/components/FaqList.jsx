export default function FaqList({ items, className = "faq-list" }) {
  return (
    <div className={className}>
      {items.map((item, index) => (
        <details className="faq-item" key={item.id ?? item.question} open={index === 0}>
          <summary>{item.question}</summary>
          <div className="faq-answer">{item.answer}</div>
        </details>
      ))}
    </div>
  );
}
