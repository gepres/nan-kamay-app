import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, ScrollView, StyleSheet, Dimensions, Image, PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import * as ImagePicker from 'expo-image-picker';
import { routeRepository } from '@infrastructure/repositories/RouteRepositoryImpl';
import { getPublicRouteDetailUseCase } from '@application/routes/GetPublicRouteDetailUseCase';
import { Route } from '@core/entities/Route';
import { GpsPoint } from '@core/entities/GpsPoint';
import { Waypoint } from '@core/entities/Waypoint';
import RoutePostalCard, { type PostalOptions, type TraceTransform } from '@presentation/components/routes/RoutePostalCard';
import { useUiStore } from '@presentation/stores/uiStore';
import { colors } from '@presentation/theme/colors';

const { width: SCREEN_W } = Dimensions.get('window');
const PREVIEW_W = SCREEN_W - 32;

const traceBtnStyle = {
  width: 38, height: 38, borderRadius: 10,
  backgroundColor: colors.bgCard,
  borderWidth: 1, borderColor: colors.border,
  alignItems: 'center', justifyContent: 'center',
} as const;

/** Tablero de ajedrez (indica transparencia en el preview, como Strava). */
function Checkerboard({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      <Defs>
        <Pattern id="checker" width={32} height={32} patternUnits="userSpaceOnUse">
          <Rect width={32} height={32} fill="#2a2a2a" />
          <Rect width={16} height={16} fill="#383838" />
          <Rect x={16} y={16} width={16} height={16} fill="#383838" />
        </Pattern>
      </Defs>
      <Rect width={width} height={height} fill="url(#checker)" />
    </Svg>
  );
}

function Toggle({
  icon, label, value, onToggle,
}: { icon: keyof typeof Ionicons.glyphMap; label: string; value: boolean; onToggle: () => void }) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: value ? colors.accentSoft : colors.bgCard,
        borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14,
        borderWidth: 1, borderColor: value ? colors.accent : colors.border,
      }}
    >
      <Ionicons name={icon} size={18} color={value ? colors.accent : colors.textMuted} />
      <Text style={{ color: value ? colors.textPrimary : colors.textSecondary, fontSize: 14, fontWeight: '600', flex: 1 }}>
        {label}
      </Text>
      <Ionicons
        name={value ? 'checkmark-circle' : 'ellipse-outline'}
        size={20}
        color={value ? colors.accent : colors.textMuted}
      />
    </TouchableOpacity>
  );
}

export default function PostalEditorScreen() {
  const { id, public: publicParam } = useLocalSearchParams<{ id: string; public?: string }>();
  const isPublic = publicParam === '1';
  const { showToast } = useUiStore();
  const postalRef = useRef<View>(null);

  const [route, setRoute] = useState<Route | null>(null);
  const [gpsPoints, setGpsPoints] = useState<GpsPoint[]>([]);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);

  // Foto de fondo opcional (galería o de un waypoint).
  const [backgroundUri, setBackgroundUri] = useState<string | null>(null);

  const [options, setOptions] = useState<PostalOptions>({
    transparent: true,
    showName: true,
    showStats: true,
    showElevation: true,
  });

  // ── Reposicionar/escalar el trazo (arrastrar + zoom) ──
  const [trace, setTrace] = useState<TraceTransform>({ tx: 0, ty: 0, scale: 1 });
  const offsetRef = useRef({ x: 0, y: 0 });
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
        onPanResponderMove: (_e, g) =>
          setTrace((t) => ({ ...t, tx: offsetRef.current.x + g.dx, ty: offsetRef.current.y + g.dy })),
        onPanResponderRelease: (_e, g) => {
          offsetRef.current = { x: offsetRef.current.x + g.dx, y: offsetRef.current.y + g.dy };
        },
      }),
    [],
  );
  const zoom = (factor: number) =>
    setTrace((t) => ({ ...t, scale: Math.max(0.3, Math.min(4, t.scale * factor)) }));
  const resetTrace = () => { offsetRef.current = { x: 0, y: 0 }; setTrace({ tx: 0, ty: 0, scale: 1 }); };

  useEffect(() => {
    if (!id) return;
    const loader: Promise<[Route | null, GpsPoint[], Waypoint[]]> = isPublic
      ? getPublicRouteDetailUseCase(id).then((d) =>
          (d ? [d.route, d.gpsPoints, d.waypoints] : [null, [], []]) as [Route | null, GpsPoint[], Waypoint[]])
      : Promise.all([routeRepository.getById(id), routeRepository.getGpsPoints(id), routeRepository.getWaypoints(id)]);
    loader
      .then(([r, gps, wps]) => { setRoute(r); setGpsPoints(gps); setWaypoints(wps); })
      .finally(() => setLoading(false));
  }, [id, isPublic]);

  // Fotos de los waypoints (solo imágenes locales/remotas) para elegir de fondo.
  const waypointPhotos = waypoints.flatMap((w) => w.imageUris);

  const set = (patch: Partial<PostalOptions>) => setOptions((o) => ({ ...o, ...patch }));

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) setBackgroundUri(result.assets[0].uri);
  };

  /** Captura la postal a un PNG temporal. PNG siempre: en transparente la
   *  tarjeta no pinta fondo (alfa real); en sólido/foto el fondo va incrustado. */
  const capturePostal = async (): Promise<string | null> => {
    // view-shot es un módulo NATIVO; lo cargamos diferido para no tumbar la
    // pantalla si el binario instalado no lo incluye.
    let captureRefFn: ((ref: unknown, opts: unknown) => Promise<string>) | null = null;
    try {
      captureRefFn = require('react-native-view-shot').captureRef;
    } catch {
      captureRefFn = null;
    }
    if (!captureRefFn) {
      showToast('Reinstala la app para generar la postal (módulo de captura no incluido).', 'error');
      return null;
    }
    return captureRefFn(postalRef, { format: 'png', quality: 1, result: 'tmpfile' });
  };

  // Guardar en el equipo (galería).
  const handleSave = async () => {
    if (busy || !route) return;
    setBusy('save');
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        showToast('Permiso de galería denegado.', 'error');
        return;
      }
      const uri = await capturePostal();
      if (!uri) return;
      await MediaLibrary.saveToLibraryAsync(uri);
      showToast('Postal guardada en tu galería.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo guardar la postal.', 'error');
    } finally {
      setBusy(null);
    }
  };

  // Compartir (hoja del sistema), sin guardar en galería.
  const handleShare = async () => {
    if (busy || !route) return;
    setBusy('share');
    try {
      const uri = await capturePostal();
      if (!uri) return;
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Compartir postal' });
      } else {
        showToast('Compartir no está disponible en este dispositivo.', 'error');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo compartir la postal.', 'error');
    } finally {
      setBusy(null);
    }
  };

  if (loading || !route) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </SafeAreaView>
    );
  }

  if (gpsPoints.length < 2) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary, justifyContent: 'center', alignItems: 'center', gap: 16 }}>
        <Text style={{ color: colors.textMuted }}>Esta ruta no tiene traza para la postal.</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: colors.accent, fontWeight: '700' }}>Volver</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
      }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '700' }}>Compartir postal</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}>
        {/* Preview (arrastra para mover el trazo) */}
        <View
          {...pan.panHandlers}
          style={{
            borderRadius: 16, overflow: 'hidden', marginTop: 8,
            alignItems: 'center', justifyContent: 'center',
            minHeight: PREVIEW_W * 0.7,
          }}
        >
          {/* Checkerboard solo en transparente (sin foto) para evidenciar el alfa */}
          {options.transparent && !backgroundUri && (
            <Checkerboard width={PREVIEW_W + 32} height={PREVIEW_W * 1.4} />
          )}
          {/* Nodo capturado: solo la postal, sin fondo opaco alrededor */}
          <View ref={postalRef} collapsable={false} style={{ width: PREVIEW_W }}>
            <RoutePostalCard
              route={route}
              gpsPoints={gpsPoints}
              options={options}
              width={PREVIEW_W}
              backgroundUri={backgroundUri}
              traceTransform={trace}
            />
          </View>
        </View>

        {/* Controles del trazo: arrastrar (gesto) + zoom + reset */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
            <Ionicons name="move-outline" size={15} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>
              Arrastra el trazo para moverlo
            </Text>
          </View>
          <TouchableOpacity onPress={() => zoom(1 / 1.2)} style={traceBtnStyle}>
            <Ionicons name="remove" size={18} color={colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => zoom(1.2)} style={traceBtnStyle}>
            <Ionicons name="add" size={18} color={colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity onPress={resetTrace} style={traceBtnStyle}>
            <Ionicons name="refresh" size={16} color={colors.accent} />
          </TouchableOpacity>
        </View>

        {/* Estilo (oculto cuando hay foto de fondo: la foto define el fondo) */}
        {!backgroundUri && (
          <>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', marginTop: 24, marginBottom: 10 }}>
              ESTILO
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <StyleChip
                label="Transparente"
                sub="Estilo Strava"
                icon="git-network-outline"
                active={options.transparent}
                onPress={() => set({ transparent: true })}
              />
              <StyleChip
                label="Tarjeta"
                sub="Fondo sólido"
                icon="square"
                active={!options.transparent}
                onPress={() => set({ transparent: false })}
              />
            </View>
          </>
        )}

        {/* Fondo: foto opcional (galería o de un waypoint) */}
        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', marginTop: 24, marginBottom: 10 }}>
          FOTO DE FONDO
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {/* Sin fondo */}
          <TouchableOpacity
            onPress={() => setBackgroundUri(null)}
            style={{
              width: 64, height: 64, borderRadius: 12,
              backgroundColor: colors.bgCard,
              borderWidth: 1.5, borderColor: !backgroundUri ? colors.accent : colors.border,
              alignItems: 'center', justifyContent: 'center', gap: 2,
            }}
          >
            <Ionicons name="ban-outline" size={20} color={!backgroundUri ? colors.accent : colors.textMuted} />
            <Text style={{ color: !backgroundUri ? colors.accent : colors.textMuted, fontSize: 9 }}>Ninguna</Text>
          </TouchableOpacity>

          {/* Elegir de galería */}
          <TouchableOpacity
            onPress={pickFromGallery}
            style={{
              width: 64, height: 64, borderRadius: 12,
              backgroundColor: colors.bgInput,
              borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed',
              alignItems: 'center', justifyContent: 'center', gap: 2,
            }}
          >
            <Ionicons name="image-outline" size={20} color={colors.accent} />
            <Text style={{ color: colors.textMuted, fontSize: 9 }}>Galería</Text>
          </TouchableOpacity>

          {/* Fotos de los waypoints */}
          {waypointPhotos.map((uri) => {
            const selected = backgroundUri === uri;
            return (
              <TouchableOpacity key={uri} onPress={() => setBackgroundUri(uri)} style={{ position: 'relative' }}>
                <Image
                  source={{ uri }}
                  style={{
                    width: 64, height: 64, borderRadius: 12,
                    borderWidth: 2, borderColor: selected ? colors.accent : colors.border,
                  }}
                />
                {selected && (
                  <View style={{
                    position: 'absolute', top: 4, right: 4,
                    backgroundColor: colors.accent, borderRadius: 9, width: 18, height: 18,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Ionicons name="checkmark" size={12} color="#0D1B12" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {waypointPhotos.length === 0 && (
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 8 }}>
            Esta ruta no tiene fotos en sus waypoints. Usa "Galería" para elegir una.
          </Text>
        )}

        {/* Contenido */}
        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', marginTop: 24, marginBottom: 10 }}>
          CONTENIDO
        </Text>
        <View style={{ gap: 10 }}>
          <Toggle icon="text-outline" label="Nombre de la ruta" value={options.showName} onToggle={() => set({ showName: !options.showName })} />
          <Toggle icon="stats-chart-outline" label="Estadísticas" value={options.showStats} onToggle={() => set({ showStats: !options.showStats })} />
          <Toggle icon="trending-up-outline" label="Perfil de elevación" value={options.showElevation} onToggle={() => set({ showElevation: !options.showElevation })} />
        </View>
      </ScrollView>

      {/* Barra fija: Guardar (en el equipo) + Compartir, separados */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28,
        backgroundColor: colors.bgPrimary, borderTopWidth: 1, borderTopColor: colors.border,
        flexDirection: 'row', gap: 12,
      }}>
        {/* Guardar en el equipo */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={busy !== null}
          style={{
            flex: 1,
            backgroundColor: colors.bgCard, borderRadius: 14, paddingVertical: 16,
            borderWidth: 1, borderColor: colors.accent,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: busy !== null && busy !== 'save' ? 0.5 : 1,
          }}
        >
          {busy === 'save' ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <>
              <Ionicons name="download-outline" size={20} color={colors.accent} />
              <Text style={{ color: colors.accent, fontSize: 16, fontWeight: '700' }}>Guardar</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Compartir */}
        <TouchableOpacity
          onPress={handleShare}
          disabled={busy !== null}
          style={{
            flex: 1,
            backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 16,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: busy !== null && busy !== 'share' ? 0.5 : 1,
          }}
        >
          {busy === 'share' ? (
            <ActivityIndicator color={colors.bgPrimary} />
          ) : (
            <>
              <Ionicons name="share-social-outline" size={20} color={colors.bgPrimary} />
              <Text style={{ color: colors.bgPrimary, fontSize: 16, fontWeight: '700' }}>Compartir</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function StyleChip({
  label, sub, icon, active, onPress,
}: { label: string; sub: string; icon: keyof typeof Ionicons.glyphMap; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flex: 1, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14,
        backgroundColor: active ? colors.accentSoft : colors.bgCard,
        borderWidth: 1, borderColor: active ? colors.accent : colors.border,
        gap: 4,
      }}
    >
      <Ionicons name={icon} size={20} color={active ? colors.accent : colors.textMuted} />
      <Text style={{ color: active ? colors.textPrimary : colors.textSecondary, fontSize: 14, fontWeight: '700', marginTop: 4 }}>
        {label}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 11 }}>{sub}</Text>
    </TouchableOpacity>
  );
}
