import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, Linking, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Colors } from '../constants/theme';
import {
  AdminCredentialSummary,
  deleteInventoryCredential,
  getApiBase,
  listInventoryCredentials,
  saveInventoryCredential,
} from '../hooks/useGemini';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function SettingsModal({ visible, onClose }: SettingsModalProps) {
  const [provider, setProvider] = useState<'gemini' | 'ollama'>('gemini');
  const [ollamaModel, setOllamaModel] = useState('qwen3.5:0.8b');
  const [adminToken, setAdminToken] = useState('');
  const [adminStatus, setAdminStatus] = useState<string | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [registryEnabled, setRegistryEnabled] = useState<boolean | null>(null);
  const [credentials, setCredentials] = useState<AdminCredentialSummary[]>([]);
  const [credentialRef, setCredentialRef] = useState('');
  const [credentialMode, setCredentialMode] = useState<'api_key' | 'oauth'>('api_key');
  const [credentialValue, setCredentialValue] = useState('');
  const [credentialHeaderName, setCredentialHeaderName] = useState('X-API-Key');
  const appExtra = (Constants.expoConfig?.extra || {}) as Record<string, string | undefined>;

  const policyLinks = [
    {
      label: 'Privacy Policy',
      url: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL || appExtra.privacyPolicyUrl,
      icon: 'shield-checkmark-outline' as const,
    },
    {
      label: 'Terms of Service',
      url: process.env.EXPO_PUBLIC_TERMS_URL || appExtra.termsUrl,
      icon: 'document-text-outline' as const,
    },
    {
      label: 'Support',
      url: process.env.EXPO_PUBLIC_SUPPORT_URL || appExtra.supportUrl,
      icon: 'help-circle-outline' as const,
    },
  ];

  useEffect(() => {
    if (visible) {
      loadSettings();
    } else {
      setCredentialValue('');
    }
  }, [visible]);

  const loadSettings = async () => {
    try {
      const savedProvider = await AsyncStorage.getItem('ai_provider');
      const savedModel = await AsyncStorage.getItem('ollama_model');
      if (savedProvider) setProvider(savedProvider as 'gemini' | 'ollama');
      if (savedModel) setOllamaModel(savedModel);
    } catch (e) {
      console.error('Failed to load settings', e);
    }
  };

  const saveSettings = async () => {
    try {
      await AsyncStorage.setItem('ai_provider', provider);
      await AsyncStorage.setItem('ollama_model', ollamaModel);
      onClose();
    } catch (e) {
      console.error('Failed to save settings', e);
    }
  };

  const requireAdminToken = () => {
    const token = adminToken.trim();
    if (!token) {
      setAdminStatus('Enter the API admin token to manage backend credential references.');
      return null;
    }
    return token;
  };

  const loadCredentials = async () => {
    const token = requireAdminToken();
    if (!token) return;

    setAdminLoading(true);
    setAdminStatus(null);
    try {
      const result = await listInventoryCredentials(token);
      setCredentials(result.credentials || []);
      setRegistryEnabled(result.registryEnabled);
      setAdminStatus(
        result.registryEnabled
          ? `Loaded ${result.credentials?.length || 0} backend credential reference${result.credentials?.length === 1 ? '' : 's'}.`
          : 'Registry reads are available, but runtime writes need INVENTORY_CONNECTOR_SECRETS_FILE on the API server.'
      );
    } catch (e: any) {
      setRegistryEnabled(null);
      setAdminStatus(e?.message || 'Unable to load backend credential references.');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleSaveCredential = async () => {
    const token = requireAdminToken();
    if (!token) return;

    const ref = credentialRef.trim();
    const secretValue = credentialValue.trim();
    if (!ref || !secretValue) {
      setAdminStatus('Credential ref and secret value are required.');
      return;
    }

    setAdminLoading(true);
    setAdminStatus(null);
    try {
      const payload = credentialMode === 'api_key'
        ? {
            credentialRef: ref,
            headerName: credentialHeaderName.trim() || 'X-API-Key',
            value: secretValue,
          }
        : {
            credentialRef: ref,
            accessToken: secretValue,
            scheme: 'Bearer',
          };
      const result = await saveInventoryCredential(token, payload);
      setCredentialValue('');
      setCredentials(prev => {
        const others = prev.filter(item => item.credentialRef !== result.credential.credentialRef);
        return [result.credential, ...others].sort((left, right) => left.credentialRef.localeCompare(right.credentialRef));
      });
      setRegistryEnabled(true);
      setAdminStatus(`Saved backend credential reference "${result.credential.credentialRef}". Raw secret was not stored in the app.`);
    } catch (e: any) {
      setAdminStatus(e?.message || 'Unable to save backend credential reference.');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleDeleteCredential = async (ref: string) => {
    const token = requireAdminToken();
    if (!token) return;

    setAdminLoading(true);
    setAdminStatus(null);
    try {
      const result = await deleteInventoryCredential(token, ref);
      setCredentials(prev => prev.filter(item => item.credentialRef !== ref));
      setAdminStatus(result.deleted ? `Deleted backend credential reference "${ref}".` : `No registry-file credential existed for "${ref}".`);
    } catch (e: any) {
      setAdminStatus(e?.message || `Unable to delete backend credential reference "${ref}".`);
    } finally {
      setAdminLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Settings</Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close settings"
            >
              <Ionicons name="close" size={24} color={Colors.white} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>AI Provider</Text>
            <View style={styles.providerRow}>
              <TouchableOpacity
                style={[styles.providerButton, provider === 'gemini' && styles.providerButtonActive]}
                onPress={() => setProvider('gemini')}
                accessibilityRole="button"
                accessibilityLabel="Use Gemini cloud AI provider"
                accessibilityState={{ selected: provider === 'gemini' }}
              >
                <Text style={[styles.providerButtonText, provider === 'gemini' && styles.providerButtonTextActive]}>Gemini (Cloud)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.providerButton, provider === 'ollama' && styles.providerButtonActive]}
                onPress={() => setProvider('ollama')}
                accessibilityRole="button"
                accessibilityLabel="Use Ollama local AI provider"
                accessibilityState={{ selected: provider === 'ollama' }}
              >
                <Text style={[styles.providerButtonText, provider === 'ollama' && styles.providerButtonTextActive]}>Ollama (Local)</Text>
              </TouchableOpacity>
            </View>

            {provider === 'ollama' && (
              <View style={styles.ollamaSettings}>
                <Text style={styles.label}>Ollama Model</Text>
                <TextInput
                  style={styles.input}
                  value={ollamaModel}
                  onChangeText={setOllamaModel}
                  placeholder="e.g. llama3, mistral"
                  placeholderTextColor={Colors.gray[500]}
                />
                <Text style={styles.helpText}>
                  Note: Local image generation is not supported by Ollama. Image analysis requires a vision model like 'llava'. Ensure Ollama is running on localhost:11434.
                </Text>
              </View>
            )}

            <View style={styles.adminPanel}>
              <View style={styles.policyHeader}>
                <Ionicons name="server-outline" size={18} color={Colors.accent} />
                <Text style={styles.policyTitle}>Admin Connector Credentials</Text>
              </View>
              <Text style={styles.policyText}>
                Register API-key or OAuth credential references on the backend. The workflow stores only the reference name in the app.
              </Text>
              <Text style={styles.apiHostText}>API host: {getApiBase()}</Text>

              <Text style={styles.compactLabel}>Admin token</Text>
              <TextInput
                style={styles.input}
                value={adminToken}
                onChangeText={setAdminToken}
                placeholder="Session-only API admin token"
                placeholderTextColor={Colors.gray[500]}
                autoCapitalize="none"
                secureTextEntry
              />

              <View style={styles.adminActionRow}>
                <TouchableOpacity
                  style={[styles.adminButton, adminLoading && styles.disabledButton]}
                  onPress={loadCredentials}
                  disabled={adminLoading}
                  accessibilityRole="button"
                  accessibilityLabel="Load backend credential references"
                >
                  <Ionicons name="refresh-outline" size={16} color={Colors.accent} />
                  <Text style={styles.adminButtonText}>{adminLoading ? 'Working...' : 'Load Refs'}</Text>
                </TouchableOpacity>
                <View style={[styles.registryBadge, registryEnabled === false && styles.registryBadgeWarn]}>
                  <Text style={styles.registryBadgeText}>
                    {registryEnabled === null ? 'not checked' : registryEnabled ? 'registry on' : 'writes off'}
                  </Text>
                </View>
              </View>

              <Text style={styles.compactLabel}>Credential reference</Text>
              <TextInput
                style={styles.input}
                value={credentialRef}
                onChangeText={setCredentialRef}
                placeholder="partsledger-prod-api-key"
                placeholderTextColor={Colors.gray[500]}
                autoCapitalize="none"
              />

              <View style={styles.providerRow}>
                {(['api_key', 'oauth'] as const).map(mode => (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.providerButton, credentialMode === mode && styles.providerButtonActive]}
                    onPress={() => setCredentialMode(mode)}
                    accessibilityRole="button"
                    accessibilityLabel={mode === 'api_key' ? 'Use API key credential mode' : 'Use OAuth credential mode'}
                    accessibilityState={{ selected: credentialMode === mode }}
                  >
                    <Text style={[styles.providerButtonText, credentialMode === mode && styles.providerButtonTextActive]}>
                      {mode === 'api_key' ? 'API Key' : 'OAuth'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {credentialMode === 'api_key' && (
                <>
                  <Text style={styles.compactLabel}>Header name</Text>
                  <TextInput
                    style={styles.input}
                    value={credentialHeaderName}
                    onChangeText={setCredentialHeaderName}
                    placeholder="X-API-Key"
                    placeholderTextColor={Colors.gray[500]}
                    autoCapitalize="none"
                  />
                </>
              )}

              <Text style={styles.compactLabel}>{credentialMode === 'api_key' ? 'API key value' : 'OAuth bearer token'}</Text>
              <TextInput
                style={styles.input}
                value={credentialValue}
                onChangeText={setCredentialValue}
                placeholder="Sent to backend, then cleared from this form"
                placeholderTextColor={Colors.gray[500]}
                autoCapitalize="none"
                secureTextEntry
              />

              <TouchableOpacity
                style={[styles.saveCredentialButton, adminLoading && styles.disabledButton]}
                onPress={handleSaveCredential}
                disabled={adminLoading}
                accessibilityRole="button"
                accessibilityLabel="Save backend credential reference"
              >
                <Ionicons name="key-outline" size={17} color={Colors.black} />
                <Text style={styles.saveCredentialButtonText}>Save Credential Ref</Text>
              </TouchableOpacity>

              {adminStatus && <Text style={styles.adminStatusText}>{adminStatus}</Text>}

              <View style={styles.credentialList}>
                {credentials.map(item => (
                  <View key={item.credentialRef} style={styles.credentialCard}>
                    <View style={styles.credentialInfo}>
                      <Text style={styles.credentialRefText}>{item.credentialRef}</Text>
                      <Text style={styles.credentialMetaText}>
                        {(item.authModes || []).join(', ') || 'credential'} | {(item.headerNames || []).join(', ') || 'headers hidden'} | {item.source || 'backend'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.deleteCredentialButton}
                      onPress={() => handleDeleteCredential(item.credentialRef)}
                      disabled={adminLoading}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete credential reference ${item.credentialRef}`}
                    >
                      <Ionicons name="trash-outline" size={15} color={Colors.red[500]} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.policyPanel}>
              <View style={styles.policyHeader}>
                <Ionicons name="camera-outline" size={18} color={Colors.accent} />
                <Text style={styles.policyTitle}>Camera & Data Use</Text>
              </View>
              <Text style={styles.policyText}>
                Camera access is used to scan machines for inventory matching and reconstruction planning. Exports and quote packets require user action before anything is shared.
              </Text>
              <View style={styles.linkList}>
                {policyLinks.map(link => (
                  <TouchableOpacity
                    key={link.label}
                    style={styles.policyLink}
                    onPress={() => link.url && Linking.openURL(link.url)}
                    disabled={!link.url}
                  >
                    <Ionicons name={link.icon} size={16} color={Colors.accent} />
                    <Text style={styles.policyLinkText}>{link.label}</Text>
                    <Ionicons name="open-outline" size={14} color={Colors.gray[500]} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>

          <TouchableOpacity
            style={styles.saveButton}
            onPress={saveSettings}
            accessibilityRole="button"
            accessibilityLabel="Save settings"
          >
            <Text style={styles.saveButtonText}>Save Changes</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: Colors.gray[900],
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    maxHeight: '88%',
    borderWidth: 1,
    borderColor: Colors.gray[800],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.white,
  },
  body: {
    maxHeight: 440,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.gray[300],
    marginBottom: 12,
  },
  providerRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  providerButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.gray[700],
    alignItems: 'center',
  },
  providerButtonActive: {
    backgroundColor: Colors.accent + '20',
    borderColor: Colors.accent,
  },
  providerButtonText: {
    color: Colors.gray[400],
    fontWeight: '600',
  },
  providerButtonTextActive: {
    color: Colors.accent,
  },
  ollamaSettings: {
    marginBottom: 24,
  },
  input: {
    backgroundColor: Colors.gray[800],
    borderWidth: 1,
    borderColor: Colors.gray[700],
    borderRadius: 8,
    padding: 12,
    color: Colors.white,
    fontSize: 16,
    marginBottom: 8,
  },
  helpText: {
    color: Colors.gray[500],
    fontSize: 12,
    lineHeight: 18,
  },
  adminPanel: {
    borderWidth: 1,
    borderColor: Colors.gray[800],
    borderRadius: 8,
    padding: 14,
    marginBottom: 24,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  apiHostText: {
    color: Colors.gray[500],
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 12,
  },
  compactLabel: {
    color: Colors.gray[300],
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  adminActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  adminButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  adminButtonText: {
    color: Colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.55,
  },
  registryBadge: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: Colors.green[900],
  },
  registryBadgeWarn: {
    backgroundColor: Colors.orange[900],
  },
  registryBadgeText: {
    color: Colors.gray[300],
    fontSize: 11,
    fontWeight: '700',
  },
  saveCredentialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingVertical: 12,
    marginTop: 4,
  },
  saveCredentialButtonText: {
    color: Colors.black,
    fontSize: 13,
    fontWeight: '800',
  },
  adminStatusText: {
    color: Colors.gray[400],
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
  },
  credentialList: {
    gap: 8,
    marginTop: 12,
  },
  credentialCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.gray[800],
    backgroundColor: Colors.gray[900],
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  credentialInfo: {
    flex: 1,
    minWidth: 0,
  },
  credentialRefText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  credentialMetaText: {
    color: Colors.gray[500],
    fontSize: 10,
    lineHeight: 14,
    marginTop: 2,
  },
  deleteCredentialButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.red[900],
  },
  policyPanel: {
    borderWidth: 1,
    borderColor: Colors.gray[800],
    borderRadius: 8,
    padding: 14,
    marginBottom: 24,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  policyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  policyTitle: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: 'bold',
  },
  policyText: {
    color: Colors.gray[400],
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  linkList: {
    gap: 8,
  },
  policyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: Colors.gray[800],
  },
  policyLinkText: {
    flex: 1,
    color: Colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: Colors.black,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
