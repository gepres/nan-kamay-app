/**
 * One Euro Filter (Casiez, Roussel & Vogel, 2012) — suavizado paso-bajo
 * ADAPTATIVO a la velocidad.
 *
 * Idea: a baja velocidad usa un cutoff bajo (suaviza fuerte → mata el jitter
 * del GPS y el "serpenteo" en línea recta y la deriva en reposo); a alta
 * velocidad sube el cutoff (responde sin lag → no corta esquinas en curvas).
 *
 * Se aplica por eje (x este / y norte en metros). La derivada se pasa por su
 * propio paso-bajo (`dCutoff`) para que picos espurios de jitter no disparen el
 * cutoff y reintroduzcan el ruido.
 */

/** Paso-bajo exponencial simple (mantiene el valor suavizado previo). */
class LowPass {
  private s: number | null = null;

  filter(value: number, alpha: number): number {
    if (this.s === null) {
      this.s = value;
      return value;
    }
    this.s = alpha * value + (1 - alpha) * this.s;
    return this.s;
  }

  reset(): void {
    this.s = null;
  }
}

export class OneEuroFilter {
  private xLP = new LowPass();
  private dxLP = new LowPass();
  private lastTime: number | null = null;
  private lastValue: number | null = null;

  constructor(
    /** Cutoff mínimo (Hz). Más bajo = más suavizado en reposo/recto. */
    private readonly minCutoff: number,
    /** Coeficiente de velocidad. Más alto = más responsivo al moverse. */
    private readonly beta: number,
    /** Cutoff del paso-bajo de la derivada (Hz). */
    private readonly dCutoff: number = 1,
  ) {}

  private alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  /** `value` en metros, `tMs` en milisegundos. Devuelve el valor suavizado. */
  filter(value: number, tMs: number): number {
    if (this.lastTime === null || this.lastValue === null) {
      this.lastTime = tMs;
      this.lastValue = value;
      this.xLP.filter(value, 1);
      return value;
    }

    let dt = (tMs - this.lastTime) / 1000;
    if (dt <= 0) dt = 1e-3; // guarda contra timestamps no monótonos
    this.lastTime = tMs;

    const dx = (value - this.lastValue) / dt;
    this.lastValue = value;
    const edx = this.dxLP.filter(dx, this.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.xLP.filter(value, this.alpha(cutoff, dt));
  }

  /** Deja el filtro listo en torno a un valor inicial sin introducir lag. */
  seed(value: number, tMs: number): void {
    this.reset();
    this.lastTime = tMs;
    this.lastValue = value;
    this.xLP.filter(value, 1);
  }

  reset(): void {
    this.xLP.reset();
    this.dxLP.reset();
    this.lastTime = null;
    this.lastValue = null;
  }
}
