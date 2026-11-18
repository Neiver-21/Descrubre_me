import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import {
  Alert,
  ActivityIndicator,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AuthScreen, { type AuthUser } from './AuthScreen';

const API_BASE_URL = 'https://descrubreme-production.up.railway.app/api/v1';

type TabId = 'nearby' | 'cities' | 'places' | 'categories';

type City = {
  id: number;
  name: string;
  country: string;
  region?: string | null;
  description?: string | null;
};

type Place = {
  id: number;
  city_id: number;
  category_id?: number | null;
  name: string;
  description?: string | null;
  address?: string | null;
  city_name?: string;
  category_name?: string | null;
  source_url?: string | null;
  distance_km?: number | string | null;
};

type Category = {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
};

type Tab = {
  id: TabId;
  label: string;
};

const TABS: Tab[] = [
  { id: 'nearby', label: 'Cerca' },
  { id: 'cities', label: 'Ciudades' },
  { id: 'places', label: 'Lugares' },
  { id: 'categories', label: 'Categorías' },
];

const NEARBY_RADII = [1, 5, 10, 25, 50];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCity(value: unknown): value is City {
  return isRecord(value) &&
    Number.isSafeInteger(value.id) &&
    typeof value.name === 'string' &&
    typeof value.country === 'string';
}

function isPlace(value: unknown): value is Place {
  return isRecord(value) &&
    Number.isSafeInteger(value.id) &&
    Number.isSafeInteger(value.city_id) &&
    typeof value.name === 'string';
}

function isCategory(value: unknown): value is Category {
  return isRecord(value) &&
    Number.isSafeInteger(value.id) &&
    typeof value.name === 'string' &&
    typeof value.slug === 'string';
}

function isCategorySelection(value: unknown): value is { category_ids: number[] } {
  return isRecord(value) &&
    Array.isArray(value.category_ids) &&
    value.category_ids.every((id) =>
      typeof id === 'number' && Number.isSafeInteger(id) && id > 0
    );
}

function isAuthUser(value: unknown): value is AuthUser {
  return isRecord(value) &&
    Number.isSafeInteger(value.id) &&
    typeof value.name === 'string' &&
    typeof value.email === 'string';
}

async function fetchList<T>(
  path: string,
  isItem: (value: unknown) => value is T
): Promise<T[]> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`El servidor respondió con el código ${response.status}.`);
  }

  const payload: unknown = await response.json();
  if (!isRecord(payload) || payload.status !== 'success' || !Array.isArray(payload.data)) {
    throw new Error('La respuesta del servidor no tiene el formato esperado.');
  }

  const records: unknown[] = payload.data;
  if (!records.every(isItem)) {
    throw new Error('El servidor devolvió datos que la aplicación no reconoce.');
  }
  return records;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function isWikidataUrl(value: string | null | undefined): value is string {
  return typeof value === 'string' &&
    /^https:\/\/www\.wikidata\.org\/wiki\/Q\d+$/.test(value);
}

async function openSource(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('No se pudo abrir la fuente', 'Inténtalo de nuevo más tarde.');
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('nearby');
  const [search, setSearch] = useState('');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionUser, setSessionUser] = useState<AuthUser | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [signOutError, setSignOutError] = useState('');
  const [cities, setCities] = useState<City[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nearbyPlaces, setNearbyPlaces] = useState<Place[]>([]);
  const [nearbyRadius, setNearbyRadius] = useState(10);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState('');
  const [nearbyHasSearched, setNearbyHasSearched] = useState(false);
  const [preferredCategoryIds, setPreferredCategoryIds] = useState<number[]>([]);
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [preferencesError, setPreferencesError] = useState('');

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      try {
        const token = await SecureStore.getItemAsync('authToken');
        if (!token) {
          return;
        }

        const response = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.status === 401) {
          await SecureStore.deleteItemAsync('authToken');
          return;
        }
        if (!response.ok) {
          throw new Error(`El servidor respondió con el código ${response.status}.`);
        }

        const payload: unknown = await response.json();
        if (!isRecord(payload) || payload.status !== 'success' ||
            !isRecord(payload.data) || !isAuthUser(payload.data.user)) {
          throw new Error('El servidor devolvió una sesión no válida.');
        }
        if (active) {
          setSessionToken(token);
          setSessionUser(payload.data.user);
        }
      } catch {
        if (active) {
          setSessionError('No se pudo validar la sesión. Revisa tu conexión e inicia sesión de nuevo.');
        }
      } finally {
        if (active) {
          setSessionLoading(false);
        }
      }
    }

    void restoreSession();
    return () => {
      active = false;
    };
  }, []);

  const acceptSession = useCallback(async (token: string, user: AuthUser) => {
    await SecureStore.setItemAsync('authToken', token);
    setSessionToken(token);
    setSessionUser(user);
    setSessionError('');
    setSignOutError('');
    setNearbyHasSearched(false);
    setNearbyPlaces([]);
    setNearbyError('');
    setActiveTab('nearby');
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');

    const [cityResult, placeResult, categoryResult] = await Promise.allSettled([
      fetchList('/cities', isCity),
      fetchList('/places', isPlace),
      fetchList('/categories', isCategory),
    ]);

    const errors: string[] = [];
    if (cityResult.status === 'fulfilled') {
      setCities(cityResult.value);
    } else {
      setCities([]);
      errors.push('ciudades');
    }

    if (placeResult.status === 'fulfilled') {
      setPlaces(placeResult.value);
    } else {
      setPlaces([]);
      errors.push('lugares');
    }

    if (categoryResult.status === 'fulfilled') {
      setCategories(categoryResult.value);
    } else {
      setCategories([]);
      errors.push('categorías');
    }

    if (errors.length > 0) {
      setError(`No se pudieron cargar ${errors.join(', ')}. Comprueba tu conexión e inténtalo de nuevo.`);
    }
    setLoading(false);
  }, []);

  const loadPreferences = useCallback(async () => {
    if (!sessionToken) {
      return;
    }

    setPreferencesLoading(true);
    setPreferencesError('');
    try {
      const response = await fetch(`${API_BASE_URL}/auth/preferences`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      const payload: unknown = await response.json();
      if (response.status === 401) {
        await SecureStore.deleteItemAsync('authToken');
        setSessionToken(null);
        setSessionUser(null);
        setSessionError('Tu sesión venció. Inicia sesión nuevamente.');
        throw new Error('Tu sesión venció. Inicia sesión nuevamente.');
      }
      if (!response.ok) {
        const message = isRecord(payload) && typeof payload.message === 'string'
          ? payload.message
          : `El servidor respondió con el código ${response.status}.`;
        throw new Error(message);
      }
      if (!isRecord(payload) || payload.status !== 'success' ||
          !isCategorySelection(payload.data)) {
        throw new Error('El servidor devolvió preferencias que la aplicación no reconoce.');
      }
      setPreferredCategoryIds(payload.data.category_ids);
    } catch (reason) {
      setPreferencesError(reason instanceof Error
        ? reason.message
        : 'No se pudieron cargar tus preferencias.');
    } finally {
      setPreferencesLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    if (sessionToken) {
      void loadData();
      void loadPreferences();
    }
  }, [loadData, loadPreferences, sessionToken]);

  const saveCategoryPreference = useCallback(async (categoryId: number) => {
    if (!sessionToken || preferencesSaving || preferencesLoading) {
      return;
    }

    const categoryIds = preferredCategoryIds.includes(categoryId)
      ? preferredCategoryIds.filter((id) => id !== categoryId)
      : [...preferredCategoryIds, categoryId].sort((a, b) => a - b);

    setPreferencesSaving(true);
    setPreferencesError('');
    try {
      const response = await fetch(`${API_BASE_URL}/auth/preferences`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ category_ids: categoryIds }),
      });
      const payload: unknown = await response.json();
      if (response.status === 401) {
        await SecureStore.deleteItemAsync('authToken');
        setSessionToken(null);
        setSessionUser(null);
        setSessionError('Tu sesión venció. Inicia sesión nuevamente.');
        throw new Error('Tu sesión venció. Inicia sesión nuevamente.');
      }
      if (!response.ok) {
        const message = isRecord(payload) && typeof payload.message === 'string'
          ? payload.message
          : `El servidor respondió con el código ${response.status}.`;
        throw new Error(message);
      }
      if (!isRecord(payload) || payload.status !== 'success' ||
          !isCategorySelection(payload.data)) {
        throw new Error('El servidor devolvió preferencias que la aplicación no reconoce.');
      }
      setPreferredCategoryIds(payload.data.category_ids);
      setNearbyPlaces([]);
      setNearbyHasSearched(false);
      setNearbyError('');
    } catch (reason) {
      setPreferencesError(reason instanceof Error
        ? reason.message
        : 'No se pudieron guardar tus preferencias.');
    } finally {
      setPreferencesSaving(false);
    }
  }, [preferredCategoryIds, preferencesLoading, preferencesSaving, sessionToken]);

  const loadNearby = useCallback(async () => {
    if (!sessionToken) {
      return;
    }

    setNearbyLoading(true);
    setNearbyError('');
    setNearbyHasSearched(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        throw new Error('Para encontrar lugares cercanos, permite el acceso a la ubicación.');
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const response = await fetch(`${API_BASE_URL}/places/nearby`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          radius_km: nearbyRadius,
        }),
      });
      const payload: unknown = await response.json();
      if (response.status === 401) {
        await SecureStore.deleteItemAsync('authToken');
        setSessionToken(null);
        setSessionUser(null);
        setSessionError('Tu sesión venció. Inicia sesión nuevamente.');
        throw new Error('Tu sesión venció. Inicia sesión nuevamente.');
      }
      if (!response.ok) {
        const message = isRecord(payload) && typeof payload.message === 'string'
          ? payload.message
          : `El servidor respondió con el código ${response.status}.`;
        throw new Error(message);
      }
      if (!isRecord(payload) || payload.status !== 'success' || !Array.isArray(payload.data) ||
          !payload.data.every(isPlace)) {
        throw new Error('El servidor devolvió lugares que la aplicación no reconoce.');
      }
      setNearbyPlaces(payload.data);
    } catch (reason) {
      setNearbyPlaces([]);
      setNearbyError(reason instanceof Error
        ? reason.message
        : 'No se pudo obtener tu ubicación. Inténtalo de nuevo.');
    } finally {
      setNearbyLoading(false);
    }
  }, [nearbyRadius, sessionToken]);

  async function signOut() {
    const token = sessionToken;
    let logoutMessage = '';
    try {
      const response = await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok && response.status !== 401) {
        logoutMessage = 'Se cerró la sesión en este dispositivo, pero no se pudo revocar en el servidor.';
      }
    } catch {
      logoutMessage = 'Se cerró la sesión en este dispositivo; no se pudo contactar al servidor.';
    }
    await SecureStore.deleteItemAsync('authToken');
    setSessionToken(null);
    setSessionUser(null);
    setNearbyPlaces([]);
    setNearbyHasSearched(false);
    setNearbyError('');
    setPreferredCategoryIds([]);
    setPreferencesError('');
    setSignOutError(logoutMessage);
  }

  const cityNames = useMemo(
    () => new Map(cities.map((city) => [city.id, city.name])),
    [cities]
  );
  const categoryNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories]
  );
  const query = normalize(search);

  const visibleCities = cities.filter((city) =>
    normalize(`${city.name} ${city.region ?? ''} ${city.country} ${city.description ?? ''}`).includes(query)
  );
  const visiblePlaces = places.filter((place) =>
    normalize(`${place.name} ${place.address ?? ''} ${place.description ?? ''} ${cityNames.get(place.city_id) ?? ''}`).includes(query)
  );
  const visibleNearby = nearbyPlaces.filter((place) =>
    normalize(`${place.name} ${place.address ?? ''} ${place.description ?? ''} ${place.city_name ?? ''} ${place.category_name ?? ''}`).includes(query)
  );
  const visibleCategories = categories.filter((category) =>
    normalize(`${category.name} ${category.slug} ${category.description ?? ''}`).includes(query)
  );

  const selectedTab = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];
  const count = activeTab === 'nearby'
    ? visibleNearby.length
    : activeTab === 'cities'
      ? visibleCities.length
      : activeTab === 'places'
        ? visiblePlaces.length
        : visibleCategories.length;

  function renderItems() {
    if (activeTab === 'nearby') {
      return visibleNearby.map((place) => {
        const sourceUrl = isWikidataUrl(place.source_url) ? place.source_url : null;
        const distance = place.distance_km === null || place.distance_km === undefined
          ? NaN
          : Number(place.distance_km);
        const distanceLabel = Number.isFinite(distance)
          ? `${distance.toLocaleString('es', { maximumFractionDigits: 1 })} km`
          : '';
        return (
          <View key={place.id} style={styles.card}>
            <View style={styles.cardTopRow}>
              <Text style={styles.cardEyebrow}>{place.category_name ?? 'LUGAR DE INTERÉS'}</Text>
              <Text style={styles.distance}>{distanceLabel}</Text>
            </View>
            <Text style={styles.cardTitle}>{place.name}</Text>
            <Text style={styles.cardSubtitle}>
              {place.city_name ?? cityNames.get(place.city_id) ?? `Ciudad #${place.city_id}`}
              {place.address ? ` · ${place.address}` : ''}
            </Text>
            {place.description ? <Text style={styles.cardDescription}>{place.description}</Text> : null}
            {sourceUrl ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => void openSource(sourceUrl)}
                style={styles.sourceLink}
              >
                <Text style={styles.sourceLinkText}>Fuente: Wikidata (CC0)</Text>
              </Pressable>
            ) : null}
          </View>
        );
      });
    }

    if (activeTab === 'cities') {
      return visibleCities.map((city) => (
        <View key={city.id} style={styles.card}>
          <View style={styles.cardTopRow}>
            <Text style={styles.cardEyebrow}>CIUDAD</Text>
            <Text style={styles.cardId}>#{city.id}</Text>
          </View>
          <Text style={styles.cardTitle}>{city.name}</Text>
          <Text style={styles.cardSubtitle}>
            {[city.region, city.country].filter(Boolean).join(' · ')}
          </Text>
          {city.description ? <Text style={styles.cardDescription}>{city.description}</Text> : null}
        </View>
      ));
    }

    if (activeTab === 'places') {
      return visiblePlaces.map((place) => (
        <View key={place.id} style={styles.card}>
          <View style={styles.cardTopRow}>
            <Text style={styles.cardEyebrow}>
              {place.category_id ? categoryNames.get(place.category_id) ?? 'LUGAR' : 'LUGAR'}
            </Text>
            <Text style={styles.cardId}>#{place.id}</Text>
          </View>
          <Text style={styles.cardTitle}>{place.name}</Text>
          <Text style={styles.cardSubtitle}>
            {cityNames.get(place.city_id) ?? `Ciudad #${place.city_id}`}
            {place.address ? ` · ${place.address}` : ''}
          </Text>
          {place.description ? <Text style={styles.cardDescription}>{place.description}</Text> : null}
        </View>
      ));
    }

    return visibleCategories.map((category) => (
      <View key={category.id} style={styles.card}>
        <View style={styles.cardTopRow}>
          <Text style={styles.cardEyebrow}>CATEGORÍA</Text>
          <Text style={styles.cardId}>#{category.id}</Text>
        </View>
        <Text style={styles.cardTitle}>{category.name}</Text>
        <Text style={styles.cardSubtitle}>{category.slug}</Text>
        {category.description ? <Text style={styles.cardDescription}>{category.description}</Text> : null}
      </View>
    ));
  }

  if (sessionLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading}>
          <ActivityIndicator color="#187B67" size="large" />
          <Text style={styles.loadingText}>Verificando tu sesión...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!sessionToken) {
    return (
      <AuthScreen
        error={signOutError || sessionError}
        onAuthenticated={acceptSession}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>D</Text>
          </View>
          <View style={styles.headerText}>
            <Text style={styles.brand}>DESCUBREMI</Text>
            <Text style={styles.brandAccent}>CIUDAD</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={activeTab === 'nearby' ? 'Actualizar lugares cercanos' : 'Actualizar información'}
            disabled={activeTab === 'nearby' && nearbyLoading}
            onPress={() => void (activeTab === 'nearby' ? loadNearby() : loadData())}
            style={[styles.refreshButton, activeTab === 'nearby' && nearbyLoading ? styles.disabledButton : null]}
          >
            <Text style={styles.refreshText}>↻</Text>
          </Pressable>
        </View>

        <View style={styles.accountBar}>
          <Text style={styles.accountGreeting}>Hola, {sessionUser?.name ?? 'explorador'}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void signOut()}
            style={styles.signOutButton}
          >
            <Text style={styles.signOutText}>Cerrar sesión</Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>TU GUÍA LOCAL</Text>
          <Text style={styles.heroTitle}>
            {activeTab === 'nearby' ? 'Descubre lo que tienes cerca.' : 'Descubre algo nuevo.'}
          </Text>
          <Text style={styles.heroCopy}>
            {activeTab === 'nearby'
              ? 'Encuentra sitios de interés a tu alrededor.'
              : 'Explora ciudades y encuentra lugares para conocer.'}
          </Text>
          <View style={styles.apiBadge}>
            <View style={[styles.apiDot, error ? styles.apiDotError : null]} />
            <Text style={styles.apiBadgeText}>{error ? 'Conexión con problemas' : 'Información actualizada'}</Text>
          </View>
        </View>

        <TextInput
          accessibilityLabel={`Buscar en ${selectedTab.label.toLocaleLowerCase()}`}
          value={search}
          onChangeText={setSearch}
          placeholder={`Buscar ${selectedTab.label.toLocaleLowerCase()}...`}
          placeholderTextColor="#8A958F"
          style={styles.search}
          returnKeyType="search"
        />

        <View style={styles.tabs}>
          {TABS.map((tab) => (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === tab.id }}
              onPress={() => {
                setActiveTab(tab.id);
                setSearch('');
              }}
              style={[styles.tab, activeTab === tab.id ? styles.tabActive : null]}
            >
              <Text style={[styles.tabText, activeTab === tab.id ? styles.tabTextActive : null]}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {activeTab === 'nearby' ? (
          <View style={styles.nearbyControls}>
            <Text style={styles.radiusLabel}>Buscar en un radio de</Text>
            <View style={styles.radiusOptions}>
              {NEARBY_RADII.map((radius) => (
                <Pressable
                  key={radius}
                  accessibilityRole="button"
                  accessibilityState={{ selected: nearbyRadius === radius }}
                  disabled={nearbyLoading}
                  onPress={() => {
                    setNearbyRadius(radius);
                    setNearbyHasSearched(false);
                    setNearbyPlaces([]);
                    setNearbyError('');
                  }}
                  style={[styles.radiusChip, nearbyRadius === radius ? styles.radiusChipActive : null]}
                >
                  <Text style={[styles.radiusText, nearbyRadius === radius ? styles.radiusTextActive : null]}>
                    {radius} km
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.preferenceTitle}>¿Qué te interesa?</Text>
            {preferencesLoading ? (
              <ActivityIndicator color="#187B67" size="small" style={styles.preferenceLoading} />
            ) : (
              <View style={styles.preferenceOptions}>
                {categories.map((category) => {
                  const selected = preferredCategoryIds.includes(category.id);
                  return (
                    <Pressable
                      key={category.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected, disabled: preferencesSaving }}
                      disabled={preferencesSaving}
                      onPress={() => void saveCategoryPreference(category.id)}
                      style={[
                        styles.preferenceChip,
                        selected ? styles.preferenceChipActive : null,
                        preferencesSaving ? styles.disabledButton : null,
                      ]}
                    >
                      <Text style={[
                        styles.preferenceText,
                        selected ? styles.preferenceTextActive : null,
                      ]}>
                        {category.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            <Text style={styles.preferenceNote}>
              Se guardan en tu cuenta y filtran los lugares cercanos. Si no eliges ninguna, verás todas las categorías.
            </Text>
            {preferencesSaving ? (
              <Text style={styles.preferenceStatus}>Guardando tus preferencias...</Text>
            ) : null}
            {preferencesError ? (
              <View accessibilityRole="alert">
                <Text style={styles.preferencesError}>{preferencesError}</Text>
                <Pressable onPress={() => void loadPreferences()} style={styles.retryButton}>
                  <Text style={styles.retryText}>Volver a cargar</Text>
                </Pressable>
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={nearbyLoading || preferencesSaving}
              onPress={() => void loadNearby()}
              style={[
                styles.nearbyButton,
                nearbyLoading || preferencesSaving ? styles.disabledButton : null,
              ]}
            >
              {nearbyLoading
                ? <ActivityIndicator color="#FFFFFF" />
                : <Text style={styles.nearbyButtonText}>
                    {nearbyHasSearched ? 'Actualizar lugares cercanos' : 'Buscar lugares cercanos'}
                  </Text>}
            </Pressable>
            <Text style={styles.locationNote}>
              Usamos tu ubicación solo para esta búsqueda; no se guarda.
            </Text>
          </View>
        ) : null}

        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.sectionTitle}>{selectedTab.label}</Text>
            <Text style={styles.sectionSubtitle}>
              {count} {count === 1 ? 'resultado' : 'resultados'}
            </Text>
          </View>
          <Text style={styles.sectionIcon}>✦</Text>
        </View>

        {error ? (
          <View style={styles.errorBox} accessibilityRole="alert">
            <Text style={styles.errorTitle}>No se pudo actualizar</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => void loadData()} style={styles.retryButton}>
              <Text style={styles.retryText}>Intentar de nuevo</Text>
            </Pressable>
          </View>
        ) : null}

        {activeTab === 'nearby' && nearbyError ? (
          <View style={styles.errorBox} accessibilityRole="alert">
            <Text style={styles.errorTitle}>No se encontraron lugares cercanos</Text>
            <Text style={styles.errorText}>{nearbyError}</Text>
          </View>
        ) : null}

        {activeTab === 'nearby' && nearbyLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color="#187B67" size="large" />
            <Text style={styles.loadingText}>Buscando lugares cerca de ti...</Text>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color="#187B67" size="large" />
            <Text style={styles.loadingText}>Cargando información...</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {renderItems()}
            {count === 0 && !error &&
              (activeTab !== 'nearby' || (!nearbyError && !nearbyLoading)) ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>⌖</Text>
                <Text style={styles.emptyTitle}>
                  {search
                    ? 'No encontramos resultados'
                    : activeTab === 'nearby' && !nearbyHasSearched
                      ? 'Busca sitios cerca de ti'
                      : activeTab === 'nearby'
                        ? 'No hay lugares en este radio'
                        : 'Todavía no hay contenido'}
                </Text>
                <Text style={styles.emptyText}>
                  {search
                    ? 'Prueba con otra búsqueda.'
                    : activeTab === 'nearby' && !nearbyHasSearched
                      ? 'Pulsa “Buscar lugares cercanos” y permite el acceso a tu ubicación.'
                      : activeTab === 'nearby'
                        ? 'Prueba con un radio más amplio o inténtalo en otra zona.'
                    : 'Cuando se agreguen datos, aparecerán aquí.'}
                </Text>
              </View>
            ) : null}
          </View>
        )}

        <Text style={styles.footer}>DESCUBRE · EXPLORA · DISFRUTA</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F7F1',
  },
  container: {
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 36,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 26,
  },
  accountBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#E8EEE7',
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 10,
    marginTop: -13,
    marginBottom: 18,
  },
  accountGreeting: {
    color: '#183B32',
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  signOutButton: {
    paddingVertical: 4,
    paddingLeft: 10,
  },
  signOutText: {
    color: '#176F5D',
    fontSize: 12,
    fontWeight: '700',
  },
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#176F5D',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  brandMarkText: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '800',
  },
  headerText: {
    flex: 1,
  },
  brand: {
    color: '#183B32',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  brandAccent: {
    color: '#187B67',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#E8EEE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshText: {
    color: '#176F5D',
    fontSize: 26,
    lineHeight: 30,
  },
  hero: {
    backgroundColor: '#183B32',
    borderRadius: 24,
    padding: 23,
    marginBottom: 20,
  },
  heroEyebrow: {
    color: '#9AD1B8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    marginBottom: 11,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
    marginBottom: 8,
  },
  heroCopy: {
    color: '#D5E2DA',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 18,
  },
  apiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 20,
    backgroundColor: '#285247',
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  apiDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#8EE0B1',
    marginRight: 7,
  },
  apiDotError: {
    backgroundColor: '#FFC078',
  },
  apiBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  search: {
    height: 50,
    borderWidth: 1,
    borderColor: '#DCE4DA',
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    color: '#183B32',
    fontSize: 14,
    marginBottom: 16,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#E8EEE7',
    borderRadius: 15,
    padding: 4,
    marginBottom: 24,
  },
  nearbyControls: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E4EAE1',
    borderWidth: 1,
    borderRadius: 18,
    padding: 15,
    marginTop: -9,
    marginBottom: 22,
  },
  radiusLabel: {
    color: '#53645A',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
  },
  radiusOptions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  preferenceTitle: {
    color: '#53645A',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  preferenceLoading: {
    alignSelf: 'flex-start',
    marginVertical: 8,
  },
  preferenceOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  preferenceChip: {
    backgroundColor: '#F1F4EF',
    borderRadius: 12,
    marginRight: 7,
    marginBottom: 7,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  preferenceChipActive: {
    backgroundColor: '#DDEFE6',
  },
  preferenceText: {
    color: '#66766D',
    fontSize: 11,
    fontWeight: '600',
  },
  preferenceTextActive: {
    color: '#176F5D',
    fontWeight: '800',
  },
  preferenceNote: {
    color: '#87938B',
    fontSize: 10,
    lineHeight: 15,
    marginBottom: 8,
  },
  preferenceStatus: {
    color: '#176F5D',
    fontSize: 11,
    marginBottom: 8,
  },
  preferencesError: {
    color: '#A13B37',
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 4,
  },
  radiusChip: {
    backgroundColor: '#F1F4EF',
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  radiusChipActive: {
    backgroundColor: '#DDEFE6',
  },
  radiusText: {
    color: '#66766D',
    fontSize: 11,
    fontWeight: '600',
  },
  radiusTextActive: {
    color: '#176F5D',
    fontWeight: '800',
  },
  nearbyButton: {
    minHeight: 46,
    borderRadius: 13,
    backgroundColor: '#176F5D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nearbyButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.7,
  },
  locationNote: {
    color: '#87938B',
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: 9,
  },
  sourceLink: {
    alignSelf: 'flex-start',
    marginTop: 10,
  },
  sourceLinkText: {
    color: '#176F5D',
    fontSize: 11,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    borderRadius: 12,
    paddingHorizontal: 5,
  },
  tabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#203E34',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tabText: {
    color: '#66766D',
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#176F5D',
    fontWeight: '700',
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 13,
  },
  sectionTitle: {
    color: '#183B32',
    fontSize: 21,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: '#78857D',
    fontSize: 12,
    marginTop: 3,
  },
  sectionIcon: {
    color: '#187B67',
    fontSize: 23,
  },
  list: {
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E4EAE1',
    borderWidth: 1,
    borderRadius: 18,
    padding: 17,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardEyebrow: {
    color: '#187B67',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  distance: {
    color: '#176F5D',
    fontSize: 11,
    fontWeight: '700',
  },
  cardId: {
    color: '#A0AAA3',
    fontSize: 11,
    fontWeight: '600',
  },
  cardTitle: {
    color: '#203E34',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardSubtitle: {
    color: '#728077',
    fontSize: 12,
    lineHeight: 18,
  },
  cardDescription: {
    color: '#53645A',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },
  errorBox: {
    backgroundColor: '#FFF5E9',
    borderColor: '#F2D2A9',
    borderWidth: 1,
    borderRadius: 16,
    padding: 15,
    marginBottom: 14,
  },
  errorTitle: {
    color: '#814D1E',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 5,
  },
  errorText: {
    color: '#765D45',
    fontSize: 12,
    lineHeight: 18,
  },
  retryButton: {
    alignSelf: 'flex-start',
    marginTop: 11,
    backgroundColor: '#E9D2B7',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  retryText: {
    color: '#664222',
    fontSize: 12,
    fontWeight: '700',
  },
  loading: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    color: '#66766D',
    fontSize: 13,
    marginTop: 12,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E4EAE1',
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingVertical: 30,
  },
  emptyIcon: {
    color: '#187B67',
    fontSize: 28,
    marginBottom: 9,
  },
  emptyTitle: {
    color: '#203E34',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyText: {
    color: '#728077',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 5,
  },
  footer: {
    color: '#9BA69E',
    textAlign: 'center',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 25,
  },
});
