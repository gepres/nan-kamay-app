import { useState, useEffect, useRef } from 'react';
import { useTrackingStore, activeElapsedSeconds } from '@presentation/stores/trackingStore';

/**
 * Tiempo activo de grabación en segundos (excluye pausas manuales y la
 * auto-pausa en curso). Se actualiza cada segundo mientras se está grabando;
 * durante una auto-pausa el valor queda congelado.
 */
export function useElapsedTime(): number {
  const { status, startedAt, totalPausedSeconds, autoPaused, autoPausedAt } = useTrackingStore();
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (status === 'recording' && startedAt) {
      const calc = () => setElapsed(activeElapsedSeconds({ startedAt, totalPausedSeconds, autoPaused, autoPausedAt }));
      calc();
      intervalRef.current = setInterval(calc, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [status, startedAt, totalPausedSeconds, autoPaused, autoPausedAt]);

  return elapsed;
}
