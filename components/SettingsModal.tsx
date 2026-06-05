import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, Linking, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Colors } from '../constants/theme';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function SettingsModal({ visible, onClose }: SettingsModalProps) {
  const [provider, setProvider] = useState<'gemini' | 'ollama'>('gemini');
  const [ollamaModel, setOllamaModel] = useState('qwen3.5:0.8b');
  const appExtra = (Constants.expoConfig?.extra || {}) as Record<string, string | undefined>;

  const policyLinks = [
    { label: 'Privacy Policy', url: appExtra.privacyPolicyUrl, icon: 'shield-checkmark-outline' as const },
    { label: 'Terms of Service', url: appExtra.termsUrl, icon: 'document-text-outline' as const },
    { label: 'Support', url: appExtra.supportUrl, icon: 'help-circle-outline' as const },
  ];

  useEffect(() => {
    if (visible) {
      loadSettings();
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

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Settings</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.white} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>AI Provider</Text>
            <View style={styles.providerRow}>
              <TouchableOpacity
                style={[styles.providerButton, provider === 'gemini' && styles.providerButtonActive]}
                onPress={() => setProvider('gemini')}
              >
                <Text style={[styles.providerButtonText, provider === 'gemini' && styles.providerButtonTextActive]}>Gemini (Cloud)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.providerButton, provider === 'ollama' && styles.providerButtonActive]}
                onPress={() => setProvider('ollama')}
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

          <TouchableOpacity style={styles.saveButton} onPress={saveSettings}>
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
