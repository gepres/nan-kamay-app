import { Barometer } from 'expo-sensors';

type BaroSubscription = ReturnType<typeof Barometer.addListener>;

/**
 * Lee el sensor barométrico y entrega ALTITUD RELATIVA (m) respecto al punto
 * donde arrancó la grabación, usando la fórmula barométrica internacional:
 *
 *   h = 44330 · (1 − (P / P₀)^(1/5.255))
 *
 * con P₀ = presión de referencia capturada al inicio (allí h = 0).
 *
 * El barómetro es mucho más suave y sensible que la altitud GPS para CAMBIOS
 * de elevación (subida/bajada), aunque deriva lentamente con el clima — por eso
 * se re-ancla periódicamente al GPS en la capa de fusión (GpsServiceImpl).
 *
 * No todos los equipos tienen barómetro: `start()` devuelve false y el resto
 * del pipeline cae a la altitud GPS sin cambios.
 */
export class BarometerService {
  private sub: BaroSubscription | null = null;
  private baseline: number | null = null; // presión de referencia (hPa)
  private relAlt = 0;                       // altitud relativa suavizada (m)
  private available = false;

  /** Suavizado ligero de la lectura (el barómetro ya es estable). */
  private static readonly SMOOTH = 0.3;

  async start(): Promise<boolean> {
    try {
      this.available = await Barometer.isAvailableAsync();
    } catch {
      this.available = false;
    }
    if (!this.available) return false;

    this.reset();
    Barometer.setUpdateInterval(1000);
    this.sub = Barometer.addListener(({ pressure }) => {
      // `pressure` viene en hPa (milibares). Algunos equipos reportan 0/NaN.
      if (pressure == null || !Number.isFinite(pressure) || pressure <= 0) return;
      if (this.baseline == null) {
        this.baseline = pressure;
        this.relAlt = 0;
        return;
      }
      const h = 44330 * (1 - Math.pow(pressure / this.baseline, 1 / 5.255));
      this.relAlt = BarometerService.SMOOTH * h + (1 - BarometerService.SMOOTH) * this.relAlt;
    });
    return true;
  }

  stop(): void {
    this.sub?.remove();
    this.sub = null;
  }

  reset(): void {
    this.baseline = null;
    this.relAlt = 0;
  }

  isAvailable(): boolean {
    return this.available;
  }

  /** true cuando ya hay una presión de referencia (al menos una lectura). */
  hasFix(): boolean {
    return this.baseline != null;
  }

  /** Altitud relativa al inicio de la grabación (m). 0 si aún no hay fix. */
  getRelativeAltitude(): number {
    return this.relAlt;
  }
}
