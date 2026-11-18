import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const API_BASE_URL = 'https://descrubreme-production.up.railway.app/api/v1';

type TabId = 'cities' | 'places' | 'categories';

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
  { id: 'cities', label: 'Ciudades' },
  { id: 'places', label: 'Lugares' },
  { id: 'categories', label: 'Categorías' },
];

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

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('cities');
  const [search, setSearch] = useState('');
  const [cities, setCities] = useState<City[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  useEffect(() => {
    void loadData();
  }, [loadData]);

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
  const visibleCategories = categories.filter((category) =>
    normalize(`${category.name} ${category.slug} ${category.description ?? ''}`).includes(query)
  );

  const selectedTab = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];
  const count = activeTab === 'cities'
    ? visibleCities.length
    : activeTab === 'places'
      ? visiblePlaces.length
      : visibleCategories.length;

  function renderItems() {
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
            accessibilityLabel="Actualizar información"
            onPress={() => void loadData()}
            style={styles.refreshButton}
          >
            <Text style={styles.refreshText}>↻</Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>TU GUÍA LOCAL</Text>
          <Text style={styles.heroTitle}>Descubre algo nuevo.</Text>
          <Text style={styles.heroCopy}>
            Explora ciudades y encuentra lugares para conocer.
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

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color="#187B67" size="large" />
            <Text style={styles.loadingText}>Cargando información...</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {renderItems()}
            {count === 0 && !error ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>⌖</Text>
                <Text style={styles.emptyTitle}>
                  {search ? 'No encontramos resultados' : 'Todavía no hay contenido'}
                </Text>
                <Text style={styles.emptyText}>
                  {search
                    ? 'Prueba con otra búsqueda.'
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
