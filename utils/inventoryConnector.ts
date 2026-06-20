import AsyncStorage from '@react-native-async-storage/async-storage';
import { InventoryConnector } from '../hooks/useGemini';

export const CONNECTOR_STORAGE_KEY = 'reversr_inventory_connector';
export const FARMBOT_PUBLIC_INVENTORY_URL = 'https://raw.githubusercontent.com/vsillah/ReversR-Rebuild/main/public/inventory/farmbot-genesis-v1.8.json';
export const TRACEPARTS_PUBLIC_INVENTORY_URL = 'https://raw.githubusercontent.com/vsillah/ReversR-Rebuild/main/public/inventory/traceparts-industrial-components.json';
export const CADENAS_PUBLIC_INVENTORY_URL = 'https://raw.githubusercontent.com/vsillah/ReversR-Rebuild/main/public/inventory/cadenas-industrial-components.json';
export const DOCUMOTO_PUBLIC_INVENTORY_URL = 'https://raw.githubusercontent.com/vsillah/ReversR-Rebuild/main/public/inventory/documoto-equipment-parts-book-phase2.json';
export const INVENTORY_SOURCE_ADD_NEW_VALUE = 'add-new';

export type KnownInventorySourceValue =
  | 'farmbot-public'
  | 'traceparts-industrial'
  | 'cadenas-industrial'
  | 'documoto-parts-book';

export type InventorySourceOptionValue = KnownInventorySourceValue | typeof INVENTORY_SOURCE_ADD_NEW_VALUE;

export type KnownInventorySourceOption = {
  value: KnownInventorySourceValue;
  label: string;
  detail: string;
  connector: InventoryConnector;
};

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

export const KNOWN_INVENTORY_SOURCE_OPTIONS: KnownInventorySourceOption[] = [
  {
    value: 'farmbot-public',
    label: 'FarmBot Genesis',
    detail: 'Public machine inventory with source-backed CAD references.',
    connector: defaultConnector,
  },
  {
    value: 'traceparts-industrial',
    label: 'TraceParts Pilot',
    detail: 'Professional component/CAD catalog fixture with source-backed 3D render proof.',
    connector: {
      sourceName: 'TraceParts Industrial Components Pilot',
      sourceUrl: TRACEPARTS_PUBLIC_INVENTORY_URL,
      connectorType: 'api',
      authMode: 'none',
      credentialRef: '',
      notes: 'Normalized TraceParts pilot fixture for professional component BOM, build-sheet, and source-backed 3D render validation. Keep provider CAD/render assets as links unless licensing allows storage or redistribution.',
    },
  },
  {
    value: 'cadenas-industrial',
    label: 'CADENAS 3Dfindit Pilot',
    detail: 'Professional configurable CAD catalog fixture for swappable components.',
    connector: {
      sourceName: 'CADENAS 3Dfindit Industrial Components Pilot',
      sourceUrl: CADENAS_PUBLIC_INVENTORY_URL,
      connectorType: 'api',
      authMode: 'none',
      credentialRef: '',
      notes: 'Normalized CADENAS/3Dfindit pilot fixture for configurable CAD components, BOM, build-sheet, and provider 3D evidence validation. Keep provider assets as links unless licensing allows storage or redistribution.',
    },
  },
  {
    value: 'documoto-parts-book',
    label: 'Documoto Phase 2',
    detail: 'Whole-machine parts-book pilot for equipment assemblies and service build sheets.',
    connector: {
      sourceName: 'Documoto Equipment Parts Book Phase 2 Pilot',
      sourceUrl: DOCUMOTO_PUBLIC_INVENTORY_URL,
      connectorType: 'api',
      authMode: 'none',
      credentialRef: '',
      notes: 'Phase 2 Documoto pilot fixture for whole-machine parts books, exploded-view references, BOMs, and service build sheets. Confirm account/export rights before caching diagrams or customer equipment data.',
    },
  },
];

export const INVENTORY_SOURCE_OPTIONS: Array<{
  value: InventorySourceOptionValue;
  label: string;
  detail: string;
}> = [
  ...KNOWN_INVENTORY_SOURCE_OPTIONS.map(({ value, label, detail }) => ({ value, label, detail })),
  {
    value: INVENTORY_SOURCE_ADD_NEW_VALUE,
    label: 'Add New +',
    detail: 'Enter a new CSV, JSON, API, or ERP inventory connector.',
  },
];

export const migrateSavedConnector = (savedConnector: Partial<InventoryConnector>): InventoryConnector => {
  const merged = { ...defaultConnector, ...savedConnector };
  const isLegacyDemo = merged.sourceUrl === 'demo://sample-machines' || merged.sourceName === 'Demo Machine Inventory';
  return isLegacyDemo ? defaultConnector : merged;
};

export const getConnectorTypeLabel = (value: InventoryConnector['connectorType']) =>
  CONNECTOR_TYPE_OPTIONS.find(option => option.value === value)?.label ?? value.toUpperCase();

export const getAuthModeLabel = (value: InventoryConnector['authMode']) =>
  AUTH_MODE_OPTIONS.find(option => option.value === value)?.label ?? value.replace(/_/g, ' ');

export const getInventorySourceOptionLabel = (value: InventorySourceOptionValue) =>
  INVENTORY_SOURCE_OPTIONS.find(option => option.value === value)?.label ?? 'Add New +';

export const findKnownInventorySourceValue = (connector: Partial<InventoryConnector>): InventorySourceOptionValue => {
  const sourceUrl = String(connector.sourceUrl || '').trim();
  const sourceName = String(connector.sourceName || '').trim();
  const match = KNOWN_INVENTORY_SOURCE_OPTIONS.find(option =>
    option.connector.sourceUrl === sourceUrl || option.connector.sourceName === sourceName
  );
  return match?.value || INVENTORY_SOURCE_ADD_NEW_VALUE;
};

export const getKnownInventoryConnector = (value: InventorySourceOptionValue): InventoryConnector | null => {
  const option = KNOWN_INVENTORY_SOURCE_OPTIONS.find(item => item.value === value);
  return option ? { ...option.connector } : null;
};

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
