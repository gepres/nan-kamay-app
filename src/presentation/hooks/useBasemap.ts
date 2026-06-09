import { useEffect, useMemo, useState } from 'react';
import { useNetworkStatus } from './useNetworkStatus';
import {
  listDownloadedRegions, pickActiveRegion, buildVectorStyle,
  type DownloadedRegion,
} from '@infrastructure/services/OfflineMapsService';

export interface BasemapState {
  /** Style JSON vector si toca usar el mapa offline; `undefined` = usar raster online. */
  vectorStyleJSON?: object;
  /** true si se está usando la base vector local (sin conexión + región descargada). */
  isOfflineVector: boolean;
  activeRegion: DownloadedRegion | null;
}

/**
 * Decide la base del mapa: raster online (Thunderforest) cuando hay señal, o
 * vector local (PMTiles) cuando NO hay señal y existe una región descargada que
 * cubre la zona. El `coord` (opcional) ayuda a elegir entre varias regiones; pasa
 * un punto ESTABLE (inicio de ruta / última ubicación), no el centro en vivo del
 * paneo, para no recargar el mapa al desplazarse.
 */
export function useBasemap(coord?: { lng: number; lat: number } | null): BasemapState {
  const isConnected = useNetworkStatus();
  const [regions, setRegions] = useState<DownloadedRegion[]>([]);

  useEffect(() => {
    let alive = true;
    listDownloadedRegions().then((r) => { if (alive) setRegions(r); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Al perder señal, recargar el manifest (por si se acaba de descargar una zona).
  useEffect(() => {
    if (!isConnected) listDownloadedRegions().then(setRegions).catch(() => {});
  }, [isConnected]);

  const activeRegion = useMemo(
    () => (!isConnected ? pickActiveRegion(regions, coord ?? null) : null),
    [isConnected, regions, coord?.lng, coord?.lat],
  );

  const vectorStyleJSON = useMemo(
    () => (activeRegion ? buildVectorStyle(activeRegion) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeRegion?.id, activeRegion?.filePath],
  );

  return { vectorStyleJSON, isOfflineVector: !!activeRegion, activeRegion };
}
