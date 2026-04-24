import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/theme';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function SettingsModal({ visible, onClose }: SettingsModalProps) {
  const [provider, setProvider] = useState<'gemini' | 'ollama'>('gemini');
  const [ollamaModel, setOllamaModel] = useState('qwen3.5:0.8b');

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
