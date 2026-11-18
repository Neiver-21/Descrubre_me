import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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

export type AuthUser = {
  id: number;
  name: string;
  email: string;
};

type AuthResponse = {
  token: string;
  user: AuthUser;
};

type AuthScreenProps = {
  error?: string;
  onAuthenticated: (token: string, user: AuthUser) => Promise<void>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAuthResponse(value: unknown): value is AuthResponse {
  if (!isRecord(value) || typeof value.token !== 'string' || !isRecord(value.user)) {
    return false;
  }
  return Number.isSafeInteger(value.user.id) &&
    typeof value.user.name === 'string' &&
    typeof value.user.email === 'string';
}

export default function AuthScreen({ error: startupError, onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isRegistering = mode === 'register';

  async function submit() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isRegistering
          ? { name, email, password }
          : { email, password }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = isRecord(payload) && typeof payload.message === 'string'
          ? payload.message
          : 'No se pudo completar el acceso.';
        throw new Error(message);
      }
      if (!isRecord(payload) || payload.status !== 'success' || !isAuthResponse(payload.data)) {
        throw new Error('El servidor devolvió una respuesta de acceso no válida.');
      }
      await onAuthenticated(payload.data.token, payload.data.user);
    } catch (reason) {
      setError(reason instanceof Error
        ? reason.message
        : 'No se pudo conectar con el servidor. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>D</Text>
          </View>
          <Text style={styles.brand}>DESCUBREMI CIUDAD</Text>
          <Text style={styles.title}>
            {isRegistering ? 'Crea tu cuenta' : 'Bienvenido de nuevo'}
          </Text>
          <Text style={styles.copy}>
            {isRegistering
              ? 'Regístrate para descubrir lugares de interés cerca de ti.'
              : 'Inicia sesión para encontrar lugares que visitar cerca de ti.'}
          </Text>

          {isRegistering ? (
            <TextInput
              accessibilityLabel="Nombre"
              autoCapitalize="words"
              value={name}
              onChangeText={setName}
              placeholder="Nombre"
              placeholderTextColor="#8A958F"
              style={styles.input}
              maxLength={120}
              returnKeyType="next"
            />
          ) : null}
          <TextInput
            accessibilityLabel="Correo electrónico"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="Correo electrónico"
            placeholderTextColor="#8A958F"
            style={styles.input}
            maxLength={254}
            returnKeyType="next"
          />
          <TextInput
            accessibilityLabel="Contraseña"
            autoCapitalize="none"
            autoComplete={isRegistering ? 'new-password' : 'current-password'}
            value={password}
            onChangeText={setPassword}
            placeholder="Contraseña (mínimo 8 caracteres)"
            placeholderTextColor="#8A958F"
            style={styles.input}
            secureTextEntry
            maxLength={128}
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
          />

          {startupError || error ? (
            <View style={styles.errorBox} accessibilityRole="alert">
              <Text style={styles.errorText}>{error || startupError}</Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void submit()}
            style={[styles.submitButton, busy ? styles.disabledButton : null]}
          >
            {busy
              ? <ActivityIndicator color="#FFFFFF" />
              : <Text style={styles.submitText}>{isRegistering ? 'Crear cuenta' : 'Iniciar sesión'}</Text>}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => {
              setMode(isRegistering ? 'login' : 'register');
              setError('');
            }}
            style={styles.switchButton}
          >
            <Text style={styles.switchText}>
              {isRegistering ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
            </Text>
          </Pressable>
          <Text style={styles.privacy}>
            Tu ubicación solo se utiliza para buscar lugares cercanos y no se guarda.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F7F1',
  },
  keyboard: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 26,
    paddingVertical: 36,
  },
  brandMark: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: '#176F5D',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 13,
  },
  brandMarkText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  brand: {
    color: '#187B67',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.8,
    textAlign: 'center',
    marginBottom: 32,
  },
  title: {
    color: '#183B32',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 9,
  },
  copy: {
    color: '#66766D',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 23,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: '#DCE4DA',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 15,
    color: '#183B32',
    fontSize: 14,
    marginBottom: 12,
  },
  errorBox: {
    backgroundColor: '#FFF5E9',
    borderColor: '#F2D2A9',
    borderWidth: 1,
    borderRadius: 13,
    padding: 12,
    marginTop: 2,
    marginBottom: 12,
  },
  errorText: {
    color: '#765D45',
    fontSize: 12,
    lineHeight: 18,
  },
  submitButton: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: '#176F5D',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 3,
  },
  disabledButton: {
    opacity: 0.7,
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  switchButton: {
    alignItems: 'center',
    paddingVertical: 17,
  },
  switchText: {
    color: '#176F5D',
    fontSize: 13,
    fontWeight: '700',
  },
  privacy: {
    color: '#87938B',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 10,
  },
});
