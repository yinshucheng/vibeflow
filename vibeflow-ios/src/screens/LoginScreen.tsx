/**
 * Login/Register Screen
 *
 * Provides email + password login and registration.
 * Calls auth.ts login/register functions, which obtain API tokens.
 * On success, parent (AppProvider) detects auth state change and navigates to main.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { login, register } from '@/config/auth';
import { serverConfigService } from '@/services/server-config.service';
import { useTheme } from '@/theme';

const SERVER_PRESETS = [
  { label: '公网', url: 'http://39.105.213.147:4000' },
  { label: '本地', url: `http://${process.env.EXPO_PUBLIC_SERVER_HOST || '172.20.10.4'}:3000` },
] as const;

// Dev quick login — only shown when connected to local server
const DEV_TEST_ACCOUNT = {
  email: 'ithinker1991@gmail.com',
  password: 'test1234',
};

interface LoginScreenProps {
  onAuthSuccess: (user: { id: string; email: string }) => void;
}

type AuthMode = 'login' | 'register';

export function LoginScreen({ onAuthSuccess }: LoginScreenProps): React.JSX.Element {
  const { colors } = useTheme();

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState(serverConfigService.getServerUrlSync());
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [customUrlText, setCustomUrlText] = useState('');
  const [editingCustomUrl, setEditingCustomUrl] = useState(false);

  // Check if connected to local dev server (LAN IP or localhost)
  const isLocalServer = /localhost|127\.0\.0\.1|192\.168\.|10\.\d|172\.(1[6-9]|2\d|3[01])\./.test(serverUrl);

  const handleServerPreset = useCallback(async (url: string) => {
    await serverConfigService.setServerUrl(url);
    setServerUrl(url);
    setEditingCustomUrl(false);
    setError(null);
  }, []);

  const handleSaveCustomUrl = useCallback(async () => {
    const trimmed = customUrlText.trim();
    if (!trimmed || (!trimmed.startsWith('http://') && !trimmed.startsWith('https://'))) {
      Alert.alert('格式错误', '请输入完整地址，如 http://192.168.1.4:3000');
      return;
    }
    await serverConfigService.setServerUrl(trimmed);
    setServerUrl(trimmed);
    setEditingCustomUrl(false);
    setError(null);
  }, [customUrlText]);

  const validate = (): string | null => {
    if (!email.trim()) return 'Please enter your email';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Invalid email format';
    if (!password) return 'Please enter your password';
    if (mode === 'register') {
      if (password.length < 8) return 'Password must be at least 8 characters';
      if (password !== confirmPassword) return 'Passwords do not match';
    }
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const result = mode === 'login'
        ? await login(email.trim(), password)
        : await register(email.trim(), password);

      if (result.success) {
        if (result.user) {
          onAuthSuccess(result.user);
        } else {
          // User info not returned from login — still successful
          onAuthSuccess({ id: '', email: email.trim() });
        }
      } else {
        setError(result.error || (mode === 'login' ? 'Login failed' : 'Registration failed'));
      }
    } catch (err) {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      setError(`Network error: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError(null);
    setConfirmPassword('');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.appName, { color: colors.primary }]}>VibeFlow</Text>
            {/* Remote server badge */}
            {!/localhost|127\.0\.0\.1|192\.168\.|10\.\d|172\.(1[6-9]|2\d|3[01])\./.test(serverUrl) && (
              <View style={styles.remoteBadge}>
                <Text style={styles.remoteBadgeText}>
                  远程: {(() => { try { return new URL(serverUrl).host; } catch { return serverUrl; } })()}
                </Text>
              </View>
            )}
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </Text>
          </View>

          {/* Form */}
          <View style={[styles.form, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {error && (
              <View style={[styles.errorBanner, { backgroundColor: colors.error + '15' }]}>
                <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
              </View>
            )}

            <Text style={[styles.label, { color: colors.textSecondary }]}>Email</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              editable={!loading}
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>Password</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
              value={password}
              onChangeText={setPassword}
              placeholder={mode === 'register' ? 'At least 8 characters' : 'Enter password'}
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              editable={!loading}
            />

            {mode === 'register' && (
              <>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Confirm Password
                </Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface }]}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Re-enter password"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry
                  autoComplete="new-password"
                  editable={!loading}
                />
              </>
            )}

            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary }, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.buttonText}>
                  {mode === 'login' ? 'Sign In' : 'Create Account'}
                </Text>
              )}
            </TouchableOpacity>

            {/* Dev quick login — only shown on local server */}
            {isLocalServer && mode === 'login' && (
              <TouchableOpacity
                style={[styles.devButton, { borderColor: colors.border }]}
                onPress={() => {
                  setEmail(DEV_TEST_ACCOUNT.email);
                  setPassword(DEV_TEST_ACCOUNT.password);
                }}
                disabled={loading}
                activeOpacity={0.7}
              >
                <Text style={[styles.devButtonText, { color: colors.textSecondary }]}>
                  🧪 DEV 快速填入
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Toggle */}
          <TouchableOpacity onPress={toggleMode} style={styles.toggleRow} disabled={loading}>
            <Text style={[styles.toggleText, { color: colors.textSecondary }]}>
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            </Text>
            <Text style={[styles.toggleLink, { color: colors.primary }]}>
              {mode === 'login' ? 'Register' : 'Sign In'}
            </Text>
          </TouchableOpacity>

          {/* Server Config — collapsible */}
          <TouchableOpacity
            onPress={() => setShowServerConfig(!showServerConfig)}
            style={styles.serverToggle}
          >
            <Text style={[styles.serverToggleText, { color: colors.textMuted }]}>
              {showServerConfig ? '▼' : '▶'} 服务器: {serverUrl}
            </Text>
          </TouchableOpacity>
          {showServerConfig && (
            <View style={[styles.serverConfig, { borderColor: colors.border }]}>
              <View style={styles.serverPresetRow}>
                {SERVER_PRESETS.map((preset) => {
                  const selected = serverUrl === preset.url;
                  return (
                    <TouchableOpacity
                      key={preset.label}
                      style={[
                        styles.serverChip,
                        {
                          backgroundColor: selected ? colors.primary : 'transparent',
                          borderColor: selected ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => handleServerPreset(preset.url)}
                    >
                      <Text style={[styles.serverChipText, { color: selected ? '#FFFFFF' : colors.text }]}>
                        {preset.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  style={[
                    styles.serverChip,
                    {
                      backgroundColor: editingCustomUrl ? colors.primary : 'transparent',
                      borderColor: editingCustomUrl ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => {
                    setCustomUrlText(serverUrl);
                    setEditingCustomUrl(true);
                  }}
                >
                  <Text style={[styles.serverChipText, { color: editingCustomUrl ? '#FFFFFF' : colors.text }]}>
                    自定义
                  </Text>
                </TouchableOpacity>
              </View>
              {editingCustomUrl && (
                <View style={styles.customUrlRow}>
                  <TextInput
                    style={[styles.customUrlInput, { borderColor: colors.border, color: colors.text }]}
                    value={customUrlText}
                    onChangeText={setCustomUrlText}
                    placeholder="http://192.168.1.4:3000"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    autoFocus
                  />
                  <TouchableOpacity
                    style={[styles.customUrlSave, { backgroundColor: colors.primary }]}
                    onPress={handleSaveCustomUrl}
                  >
                    <Text style={styles.customUrlSaveText}>确定</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  appName: {
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    marginTop: 8,
  },
  remoteBadge: {
    backgroundColor: '#3B82F620',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
  },
  remoteBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3B82F6',
  },
  form: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    marginBottom: 16,
  },
  errorBanner: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  button: {
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  devButton: {
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  devButtonText: {
    fontSize: 14,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  toggleText: {
    fontSize: 14,
  },
  toggleLink: {
    fontSize: 14,
    fontWeight: '600',
  },
  serverToggle: {
    marginTop: 24,
    alignItems: 'center',
  },
  serverToggleText: {
    fontSize: 12,
  },
  serverConfig: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  serverPresetRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  serverChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  serverChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  customUrlRow: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 8,
  },
  customUrlInput: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    fontFamily: 'Menlo',
  },
  customUrlSave: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
  },
  customUrlSaveText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});
