import { useState, useEffect, useRef } from 'react';
import { useTrackingStore } from '@presentation/stores/trackingStore';

/**
 * Retorna el tiempo activo de grabación en segundos (excluye pausas).
 * Se actualiza cada segundo mientras el estado es "recording".
 */
export function useElapsedTime(): number {
  const { status, startedAt, totalPausedSeconds } = useTrackingStore();
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (status === 'recording' && startedAt) {
      // Calcular inmediatamente al montar o reanudar
      const calc = () => {
        const raw = Math.floor((Date.now() - startedAt.getTime()) / 1000);
        setElapsed(Math.max(0, raw - totalPausedSeconds));
      };
      calc();
      intervalRef.current = setInterval(calc, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [status, startedAt, totalPausedSeconds]);

  return elapsed;
}
