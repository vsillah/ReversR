import AsyncStorage from '@react-native-async-storage/async-storage';
import { InventoryConnector } from '../hooks/useGemini';

export const CONNECTOR_STORAGE_KEY = 'reversr_inventory_connector';
export const FARMBOT_PUBLIC_INVENTORY_URL = 'https://raw.githubusercontent.com/vsillah/ReversR-Rebuild/main/public/inventory/farmbot-genesis-v1.8.json';

export const CONNECTOR_TYPE_OPTIONS: Array<{ value: InventoryConnector['connectorType']; label: string; detail: string }> = [
  { value: 'demo', label: 'Demo', detail: 'Built-in sample records' },
  { value: 'csv', label: 'CSV / Spreadsheet', detail: 'Hosted CSV or spreadsheet export' },
  { value: 'api', label: 'API / JSON', detail: 'Web inventory endpoint' },
  { value: 'erp', label: 'ERP', detail: 'Enterprise inventory system' },
];

export const AUTH_MODE_OPTIONS: Array<{ value: InventoryConnector['authMode']; label: string; detail: string }> = [
  { value: 'none', label: 'None', detail: 'Public source, no credential needed' },
  { value: 'api_key', label: 'API Key', detail: 'Backend stores the secret key' },
  { value: 'oauth', label: 'OAuth', detail: 'Backend stores an OAuth token' },
  { value: 'private_network', label: 'Private Network', detail: 'Requires controlled network access' },
];

export const defaultConnector: InventoryConnector = {
  sourceName: 'FarmBot Genesis Public Inventory',
  sourceUrl: FARMBOT_PUBLIC_INVENTORY_URL,
  connectorType: 'api',
  authMode: 'none',
  credentialRef: '',
  notes: 'Public FarmBot Genesis v1.8 machine inventory generated from FarmBot hardware documentation and BOM sources. Human review is required before procurement, fabrication, or assembly.',
};

export const migrateSavedConnector = (savedConnector: Partial<InventoryConnector>): InventoryConnector => {
  const merged = { ...defaultConnector, ...savedConnector };
  const isLegacyDemo = merged.sourceUrl === 'demo://sample-machines' || merged.sourceName === 'Demo Machine Inventory';
  return isLegacyDemo ? defaultConnector : merged;
};

export const getConnectorTypeLabel = (value: InventoryConnector['connectorType']) =>
  CONNECTOR_TYPE_OPTIONS.find(option => option.value === value)?.label ?? value.toUpperCase();

export const getAuthModeLabel = (value: InventoryConnector['authMode']) =>
  AUTH_MODE_OPTIONS.find(option => option.value === value)?.label ?? value.replace(/_/g, ' ');

export const defaultAuthModeForConnectorType = (
  connectorType: InventoryConnector['connectorType']
): InventoryConnector['authMode'] => {
  if (connectorType === 'api') return 'api_key';
  if (connectorType === 'erp') return 'oauth';
  return 'none';
};

export const loadInventoryConnector = async (): Promise<InventoryConnector> => {
  const saved = await AsyncStorage.getItem(CONNECTOR_STORAGE_KEY);
  if (!saved) return defaultConnector;
  const migratedConnector = migrateSavedConnector(JSON.parse(saved));
  if (migratedConnector.sourceUrl === FARMBOT_PUBLIC_INVENTORY_URL) {
    await AsyncStorage.setItem(CONNECTOR_STORAGE_KEY, JSON.stringify(migratedConnector));
  }
  return migratedConnector;
};

export const saveInventoryConnector = async (connector: InventoryConnector) => {
  await AsyncStorage.setItem(CONNECTOR_STORAGE_KEY, JSON.stringify(connector));
};
