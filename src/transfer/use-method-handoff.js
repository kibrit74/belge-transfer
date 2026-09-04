import { useCallback, useRef, useState } from "react";

export function useMethodHandoff() {
  const handoffRef = useRef(null);
  const [handoff, setHandoff] = useState(null);

  const requestHandoff = useCallback((next) => {
    if (!next || next.to !== "package" || !(next.file instanceof File)) {
      throw new TypeError("Yöntem geçişi geçersiz.");
    }
    const value = Object.freeze({ ...next });
    handoffRef.current = value;
    setHandoff(value);
  }, []);

  const consumeHandoff = useCallback((targetMethod) => {
    const current = handoffRef.current;
    if (!current || current.to !== targetMethod) return null;
    handoffRef.current = null;
    setHandoff(null);
    return current.file;
  }, []);

  const clearHandoff = useCallback(() => {
    handoffRef.current = null;
    setHandoff(null);
  }, []);

  return { handoff, requestHandoff, consumeHandoff, clearHandoff };
}
