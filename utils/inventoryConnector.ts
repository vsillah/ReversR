import AsyncStorage from '@react-native-async-storage/async-storage';
import { InventoryConnector } from '../hooks/useGemini';

export const CONNECTOR_STORAGE_KEY = 'reversr_inventory_connector';
export const FARMBOT_PUBLIC_INVENTORY_URL = 'https://raw.githubusercontent.com/vsillah/ReversR-Rebuild/main/public/inventory/farmbot-genesis-v1.8.json';
export const TRACEPARTS_PUBLIC_INVENTORY_URL = 'https://raw.githubusercontent.com/vsillah/ReversR-Rebuild/main/public/inventory/traceparts-industrial-components.json';
export const CADENAS_PUBLIC_INVENTORY_URL = 'https://raw.githubusercontent.com/vsillah/ReversR-Rebuild/main/public/inventory/cadenas-industrial-components.json';
export const DOCUMOTO_PUBLIC_INVENTORY_URL = 'https://raw.githubusercontent.com/vsillah/ReversR-Rebuild/main/public/inventory/documoto-equipment-parts-book-phase2.json';
export const SOURCE_BACKED_2D_PROOF_INVENTORY_URL = '/inventory/source-backed-2d-proof.json';
export const INVENTORY_SOURCE_ADD_NEW_VALUE = 'add-new';

export type KnownInventorySourceValue =
  | 'farmbot-public'
  | 'traceparts-industrial'
  | 'cadenas-industrial'
  | 'documoto-parts-book'
  | 'source-backed-2d-proof';

export type InventorySourceOptionValue = KnownInventorySourceValue | typeof INVENTORY_SOURCE_ADD_NEW_VALUE;

export type KnownInventorySourceOption = {
  value: KnownInventorySourceValue;
  label: string;
  detail: string;
  connector: InventoryConnector;
};

export type InventorySourceSampleSet = {
  sourceLabel: string;
  samples: string[];
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
  {
    value: 'source-backed-2d-proof',
    label: '2D Proof Fixture',
    detail: 'Controlled source-backed 2D image fixture for proving AI is skipped.',
    connector: {
      sourceName: 'ReversR Source-Backed 2D Proof Fixture',
      sourceUrl: SOURCE_BACKED_2D_PROOF_INVENTORY_URL,
      connectorType: 'api',
      authMode: 'none',
      credentialRef: '',
      notes: 'Controlled ReversR fixture with an explicit source-backed 2D drawing. Use it to confirm the app displays source-backed 2D references before AI fallback.',
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

export const INVENTORY_SOURCE_SAMPLE_SETS: Record<KnownInventorySourceValue, InventorySourceSampleSet> = {
  'farmbot-public': {
    sourceLabel: 'FarmBot Genesis',
    samples: [
      'A FarmBot Genesis v1.8 CNC farming machine with track extrusions, gantry main beam, gantry columns, cross-slide plate, z-axis extrusion, Farmduino, Raspberry Pi, motors, encoders, UTM PCB, solenoid valve, vacuum pump, watering tools, seeder, camera, belts, pulleys, and v-wheels.',
      'A FarmBot Genesis gantry farming robot with aluminum tracks, gantry beam, z-axis, universal tool mount, Farmduino electronics, Raspberry Pi controller, motors, encoders, solenoid valve, vacuum pump, seeder, watering nozzle, camera, and power supply.',
    ],
  },
  'traceparts-industrial': {
    sourceLabel: 'TraceParts',
    samples: [
      'A linear actuator motion module with ball screw actuator, linear guide rail, stepper motor, limit switch, flexible coupling, mounting bracket, fastener kit, and provider CAD/viewer references.',
      'A source-backed actuator rebuild assembly from a professional parts catalog with guide rail, motor coupling, endstop switch, aluminum bracket, hardened steel screw, and STEP/STL CAD format availability.',
    ],
  },
  'cadenas-industrial': {
    sourceLabel: 'CADENAS 3Dfindit',
    samples: [
      'A gantry motion swap kit with profile rail guide, bearing carriage, timing belt, pulley set, stepper motor, gantry plate, cable carrier, and configurable provider 3D/CAD evidence.',
      'A desktop CNC gantry assembly with linear rails, bearing blocks, belt drive, pulleys, aluminum plate, cable carrier, and CADENAS provider-hosted CAD configurator metadata.',
    ],
  },
  'documoto-parts-book': {
    sourceLabel: 'Documoto',
    samples: [
      'A packaging conveyor parts-book assembly with drive roller, idler roller, belt section, gearmotor, guard panel, photoelectric sensor, control enclosure, fastener kit, and provider parts-book viewer reference.',
      'A whole-machine conveyor rebuild record with exploded-view service parts, serial-range parts-book notes, belt and roller assemblies, guarding, motor drive, sensors, and control enclosure.',
    ],
  },
  'source-backed-2d-proof': {
    sourceLabel: '2D Proof Fixture',
    samples: [
      'A source-backed 2D proof actuator module with ball screw actuator, linear guide rail, stepper motor, mounting bracket, limit switch, flexible coupling, and controlled source drawing evidence.',
      'A linear actuator proof module with an explicit source-backed 2D schematic, guide rail, actuator body, motor coupling, mounting brackets, endstop switch, and BOM-ready validation notes.',
    ],
  },
};

export const DEFAULT_SAMPLE_SET: InventorySourceSampleSet = {
  sourceLabel: 'General machine inventory',
  samples: [
    'A benchtop drill press with cast base, column, quill, chuck, belt drive, motor, depth stop, table, and safety guard.',
    'A small conveyor sorting machine with frame, belt, rollers, drive motor, sensors, controller, power supply, and diverter gate.',
    'A compact injection molding machine with clamp frame, heated barrel, screw drive, hopper, hydraulic unit, controller, and mold platen.',
    'A pneumatic packaging sealer with frame, heated sealing jaw, air cylinder, foot pedal, control board, power supply, and safety shield.',
    'A lab centrifuge with rotor, motor, lid latch, control panel, vibration sensor, power supply, and enclosure.',
    'A laser cutter with gantry frame, laser tube, mirrors, lens head, stepper motors, honeycomb bed, controller, exhaust fan, and water pump.',
  ],
};

export const getSampleSetForConnector = (connector: Partial<InventoryConnector>): InventorySourceSampleSet => {
  const sourceValue = findKnownInventorySourceValue(connector);
  if (sourceValue === INVENTORY_SOURCE_ADD_NEW_VALUE) return DEFAULT_SAMPLE_SET;
  return INVENTORY_SOURCE_SAMPLE_SETS[sourceValue] || DEFAULT_SAMPLE_SET;
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
