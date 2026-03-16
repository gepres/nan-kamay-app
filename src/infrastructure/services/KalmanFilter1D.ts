/**
 * Filtro Kalman 1D para suavizar lecturas GPS.
 * Se aplica una instancia por eje (latitud, longitud, altitud).
 *
 * @param q  Process noise — menor = más suave pero reacciona más lento.
 * @param r  Measurement noise — se adapta con la precisión GPS reportada.
 */
export class KalmanFilter1D {
  private x = 0;        // estimación del estado
  private p = 1;        // covarianza del error
  private initialized = false;

  constructor(
    private readonly q: number,
    private readonly r: number,
  ) {}

  /**
   * @param measurement  Lectura GPS cruda
   * @param accuracy     Precisión reportada por el GPS (metros), adapta R
   * @returns Valor filtrado
   */
  filter(measurement: number, accuracy?: number): number {
    if (!this.initialized) {
      this.x = measurement;
      this.p = accuracy ? accuracy * accuracy : this.r;
      this.initialized = true;
      return measurement;
    }

    // Predicción (modelo posición constante)
    this.p += this.q;

    // Actualización — adaptar ruido de medición si tenemos accuracy
    const effectiveR = accuracy ? accuracy * accuracy : this.r;
    const k = this.p / (this.p + effectiveR); // ganancia de Kalman
    this.x += k * (measurement - this.x);
    this.p *= (1 - k);

    return this.x;
  }

  reset(): void {
    this.initialized = false;
    this.x = 0;
    this.p = 1;
  }
}
