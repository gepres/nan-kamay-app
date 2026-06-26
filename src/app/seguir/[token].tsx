import { memo, useCallback, useEffect, useState, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import RouteMap from '@presentation/components/map/RouteMap';
import { fetchLiveSession, extractFollowToken, isValidFollowToken, type LiveSnapshot } from '@application/live/liveShareUseCases';
import { useAuthStore } from '@presentation/stores/authStore';
import { formatDistance } from '@shared/utils/formatters';
import { colors } from '@presentation/theme/colors';

/** Intervalo de consulta de la posición en vivo. */
const POLL_MS = 10000;

/** Mapa aislado: solo se re-renderiza si lon/lat cambian (no con el tick de 1 s). */
const LiveMap = memo(function LiveMap({ lon, lat }: { lon: number; lat: number }) {
  return (
    <RouteMap gpsPoints={[]} centerCoordinate={[lon, lat]} highlight={[lon, lat]} zoomLevel={15} />
  );
});

function fmtAgo(date: Date | null): string {
  if (!date) return '—';
  const s = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (s < 60) return `hace ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  return `hace ${Math.floor(m / 60)} h`;
}

function fmtTime(date: Date | null): string {
  if (!date) return '—';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export default function FollowScreen() {
  const insets = useSafeAreaInsets();
  const { user, isLoading: authLoading } = useAuthStore();
  const params = useLocalSearchParams<{ token: string }>();
  const token = extractFollowToken(String(params.token ?? ''));

  const [snap, setSnap] = useState<LiveSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [, setTick] = useState(0); // refresca el "hace Xs"

  const poll = useCallback(async () => {
    if (!token || !isValidFollowToken(token)) { setNotFound(true); setLoading(false); return; }
    try {
      const s = await fetchLiveSession(token);
      if (s == null) { setNotFound(true); setSnap(null); }
      else { setSnap(s); setNotFound(false); setErr(null); }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo consultar.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!user) return; // el guard de UI maneja el no-logueado
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [user, poll]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const header = (title: string) => (
    <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <TouchableOpacity onPress={goBack} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}>
        <Ionicons name="arrow-back" size={22} color="#fff" />
      </TouchableOpacity>
      <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '800', flex: 1 }} numberOfLines={1}>{title}</Text>
      <Ionicons name="radio" size={22} color={colors.accent} />
    </View>
  );

  const centered = (title: string, children: ReactNode) => (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      {header(title)}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>{children}</View>
    </View>
  );

  // ── Guard de sesión ──
  if (authLoading) {
    return centered('Seguimiento en vivo', <ActivityIndicator color={colors.accent} />);
  }
  if (!user) {
    return centered('Seguimiento en vivo', (
      <>
        <Ionicons name="lock-closed-outline" size={40} color={colors.textMuted} />
        <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>Inicia sesión para seguir</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 }}>
          El seguimiento en vivo usa tu cuenta de Ñan Kamay. Inicia sesión y vuelve a abrir el enlace.
        </Text>
        <TouchableOpacity onPress={() => router.replace('/login')} style={{ backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24, marginTop: 4 }}>
          <Text style={{ color: '#0D1B12', fontSize: 14, fontWeight: '800' }}>Iniciar sesión</Text>
        </TouchableOpacity>
      </>
    ));
  }

  // ── Cargando / no encontrado ──
  if (loading && !snap) {
    return centered('Seguimiento en vivo', (
      <>
        <ActivityIndicator color={colors.accent} />
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>Conectando…</Text>
      </>
    ));
  }
  if (notFound || (!snap && err)) {
    return centered('Seguimiento en vivo', (
      <>
        <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
        <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>Enlace no disponible</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 }}>
          {err ?? 'Este enlace de seguimiento no existe o ya expiró. Pídele a tu contacto que vuelva a compartir.'}
        </Text>
        <TouchableOpacity onPress={poll} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <Ionicons name="refresh" size={18} color={colors.accent} />
          <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '700' }}>Reintentar</Text>
        </TouchableOpacity>
      </>
    ));
  }

  const hasPos = snap != null && snap.lat != null && snap.lon != null;
  const ended = snap?.status === 'ended';
  const ownerName = snap?.ownerName?.trim() || 'Tu contacto';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      {header(ownerName)}

      <View style={{ flex: 1 }}>
        {hasPos ? (
          <LiveMap lon={snap!.lon as number} lat={snap!.lat as number} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 }}>
            <ActivityIndicator color={colors.accent} />
            <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center' }}>Esperando la primera posición…</Text>
          </View>
        )}

        {/* Tarjeta de estado superpuesta */}
        <View style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 20, backgroundColor: '#0D1B12EE', borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: ended ? colors.textMuted : colors.success }} />
            <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '800', flex: 1 }} numberOfLines={1}>
              {ended ? `${ownerName} finalizó` : `Siguiendo a ${ownerName}`}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              {ended ? `última ${fmtTime(snap?.lastAt ?? null)}` : fmtAgo(snap?.lastAt ?? null)}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              Distancia: <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>{formatDistance(snap?.distanceMeters ?? 0)}</Text>
            </Text>
            {snap?.accuracy != null && (
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                Precisión: <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>±{Math.round(snap.accuracy)} m</Text>
              </Text>
            )}
          </View>
          {!ended && (
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>
              Se actualiza automáticamente. Necesita conexión a internet.
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}
