import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors, FontSizes, Spacing, Radii, Fonts } from '../constants/theme';
import { useAppTheme } from '../hooks/useAppTheme';
import { ThreeDSceneDescriptor } from '../hooks/useGemini';
import {
  ManufacturingHandoff,
  ManufacturingPartMeasurement,
  ManufacturingSceneMeasurement,
} from '../utils/manufacturingHandoff';

type Props = {
  handoff: ManufacturingHandoff;
  scene: ThreeDSceneDescriptor | null;
  initiallyExpanded?: boolean;
  collapsible?: boolean;
};

type ThreeModule = typeof import('three');

const dimensionText = (dimensions: { length: number; width: number; height: number }) =>
  `${dimensions.length} x ${dimensions.width} x ${dimensions.height} mm`;

const webCanvasStyle = {
  width: '100%',
  height: 360,
  minHeight: 360,
  overflow: 'hidden',
  borderRadius: 8,
  background: '#050505',
  border: '1px solid rgba(255,255,255,0.1)',
  cursor: 'grab',
};

function ThreeManufacturingViewer({ scene }: { scene: ThreeDSceneDescriptor }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;

    const mountScene = async () => {
      if (!containerRef.current || Platform.OS !== 'web') return;

      const THREE: ThreeModule = await import('three');
      if (cancelled || !containerRef.current) return;

      cleanupRef.current?.();
      containerRef.current.innerHTML = '';

      const width = containerRef.current.clientWidth || 720;
      const height = containerRef.current.clientHeight || 360;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height);
      renderer.setClearColor(0x050505, 1);
      containerRef.current.appendChild(renderer.domElement);

      const threeScene = new THREE.Scene();
      threeScene.fog = new THREE.Fog(0x050505, 7, 16);

      const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 100);
      camera.position.set(4.4, 3.1, 5.6);
      camera.lookAt(0, 0.7, 0);

      const rig = new THREE.Group();
      rig.rotation.y = -0.42;
      threeScene.add(rig);

      const ambient = new THREE.AmbientLight(0xffffff, 0.82);
      threeScene.add(ambient);

      const key = new THREE.DirectionalLight(0xffffff, 1.25);
      key.position.set(4, 6, 5);
      threeScene.add(key);

      const fill = new THREE.DirectionalLight(0x00ff9d, 0.38);
      fill.position.set(-3, 2, -4);
      threeScene.add(fill);

      const grid = new THREE.GridHelper(6, 12, 0x335c52, 0x1f2937);
      grid.position.y = -0.18;
      rig.add(grid);

      const axes = new THREE.AxesHelper(2.25);
      axes.position.set(-2.75, -0.15, -1.95);
      rig.add(axes);

      scene.objects.forEach(object => {
        const [sx, sy, sz] = object.scale;
        let geometry: import('three').BufferGeometry;
        if (object.type === 'sphere') {
          geometry = new THREE.SphereGeometry(Math.max(sx, sy, sz) / 2, 32, 16);
        } else if (object.type === 'cylinder') {
          geometry = new THREE.CylinderGeometry(Math.max(sx, sz) / 2, Math.max(sx, sz) / 2, sy, 32);
        } else if (object.type === 'plane') {
          geometry = new THREE.PlaneGeometry(sx, sz);
        } else {
          geometry = new THREE.BoxGeometry(sx, sy, sz);
        }

        const material = new THREE.MeshStandardMaterial({
          color: object.color || '#00ff9d',
          roughness: 0.58,
          metalness: 0.18,
          wireframe: object.material === 'wireframe',
          transparent: object.material === 'wireframe',
          opacity: object.material === 'wireframe' ? 0.72 : 1,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(object.position[0], object.position[1], object.position[2]);
        mesh.rotation.set(object.rotation[0], object.rotation[1], object.rotation[2]);
        rig.add(mesh);

        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(geometry),
          new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 })
        );
        edges.position.copy(mesh.position);
        edges.rotation.copy(mesh.rotation);
        rig.add(edges);
      });

      let pointerDown = false;
      let lastX = 0;
      let lastY = 0;
      let raf = 0;

      const onPointerDown = (event: PointerEvent) => {
        pointerDown = true;
        lastX = event.clientX;
        lastY = event.clientY;
        renderer.domElement.style.cursor = 'grabbing';
      };
      const onPointerMove = (event: PointerEvent) => {
        if (!pointerDown) return;
        const deltaX = event.clientX - lastX;
        const deltaY = event.clientY - lastY;
        lastX = event.clientX;
        lastY = event.clientY;
        rig.rotation.y += deltaX * 0.008;
        rig.rotation.x = Math.max(-0.62, Math.min(0.42, rig.rotation.x + deltaY * 0.005));
      };
      const onPointerUp = () => {
        pointerDown = false;
        renderer.domElement.style.cursor = 'grab';
      };
      const onResize = () => {
        if (!containerRef.current) return;
        const nextWidth = containerRef.current.clientWidth || width;
        const nextHeight = containerRef.current.clientHeight || height;
        camera.aspect = nextWidth / nextHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(nextWidth, nextHeight);
      };

      renderer.domElement.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('resize', onResize);

      const animate = () => {
        if (!pointerDown) rig.rotation.y += 0.0022;
        renderer.render(threeScene, camera);
        raf = window.requestAnimationFrame(animate);
      };
      animate();

      cleanupRef.current = () => {
        window.cancelAnimationFrame(raf);
        renderer.domElement.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('resize', onResize);
        renderer.dispose();
        threeScene.traverse(node => {
          const mesh = node as import('three').Mesh;
          mesh.geometry?.dispose?.();
          const material = mesh.material;
          if (Array.isArray(material)) material.forEach(item => item.dispose());
          else material?.dispose?.();
        });
        if (containerRef.current?.contains(renderer.domElement)) {
          containerRef.current.removeChild(renderer.domElement);
        }
      };
    };

    mountScene();

    return () => {
      cancelled = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [scene]);

  return React.createElement('div', {
    ref: containerRef,
    style: webCanvasStyle,
    role: 'img',
    'aria-label': 'Interactive 3D manufacturing schematic',
    'data-testid': 'manufacturing-three-canvas-host',
  });
}

function NativeSchematicFallback({ measurements }: { measurements: ManufacturingSceneMeasurement[] }) {
  const { colors: Colors } = useAppTheme();
  const styles = createStyles(Colors);
  const topItems = measurements.slice(0, 4);
  return (
    <View style={styles.nativeSchematic} testID="manufacturing-native-schematic">
      <View style={styles.schematicAxisX} />
      <View style={styles.schematicAxisY} />
      {topItems.map((measurement, index) => (
        <View
          key={measurement.objectId}
          style={[
            styles.schematicBlock,
            {
              width: `${Math.min(76, Math.max(22, measurement.nominalDimensionsMm.length / 12))}%`,
              height: Math.min(76, Math.max(26, measurement.nominalDimensionsMm.height / 8)),
              left: `${Math.min(72, 8 + index * 15)}%`,
              top: `${Math.min(68, 16 + index * 10)}%`,
              borderColor: index % 2 === 0 ? Colors.accent : Colors.orange[300],
            },
          ]}
        >
          <Text style={styles.schematicBlockText} numberOfLines={1}>{measurement.label}</Text>
        </View>
      ))}
    </View>
  );
}

function MeasurementRow({ item }: { item: ManufacturingPartMeasurement }) {
  const { colors: Colors } = useAppTheme();
  const styles = createStyles(Colors);

  return (
    <View style={styles.measurementRow}>
      <View style={styles.measurementMain}>
        <Text style={styles.measurementPart} numberOfLines={1}>{item.partName}</Text>
        <Text style={styles.measurementMeta} numberOfLines={1}>{item.partNumber} | {item.material}</Text>
      </View>
      <View style={styles.measurementValueWrap}>
        <Text style={styles.measurementValue}>{dimensionText(item.nominalDimensionsMm)}</Text>
        <Text style={styles.measurementTolerance}>{item.toleranceClass}</Text>
      </View>
    </View>
  );
}

export default function ManufacturingStudio({ handoff, scene, initiallyExpanded = true, collapsible = true }: Props) {
  const { colors: Colors } = useAppTheme();
  const styles = createStyles(Colors);
  const [expanded, setExpanded] = useState(collapsible ? initiallyExpanded : true);
  const [selectedPartIndex, setSelectedPartIndex] = useState(0);
  const selectedPart = handoff.partMeasurements[selectedPartIndex] || handoff.partMeasurements[0];
  const selectedTreatment = selectedPart
    ? handoff.materialTreatmentGuidance.find(item => item.partNumber === selectedPart.partNumber)
    : undefined;
  const primarySceneMeasurements = useMemo(
    () => handoff.sceneMeasurements.slice(0, 6),
    [handoff.sceneMeasurements]
  );

  useEffect(() => {
    if (!collapsible) {
      setExpanded(true);
    }
  }, [collapsible]);

  return (
    <View style={styles.panel}>
      {collapsible ? (
        <TouchableOpacity
          style={styles.header}
          onPress={() => setExpanded(current => !current)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Collapse manufacturing studio details' : 'Expand manufacturing studio details'}
          accessibilityState={{ expanded }}
        >
          <View style={styles.headerIcon}>
            <Ionicons name="cube-outline" size={20} color={Colors.primary} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>Manufacturing Studio</Text>
            <Text style={styles.subtitle}>Visual references, CAD readiness, material treatments, datums, and DfM gates</Text>
          </View>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.dimText} />
        </TouchableOpacity>
      ) : (
        <View style={styles.headerStatic}>
          <View style={styles.headerIcon}>
            <Ionicons name="cube-outline" size={20} color={Colors.primary} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>Manufacturing Studio</Text>
            <Text style={styles.subtitle}>Visual references, CAD readiness, material treatments, datums, and DfM gates</Text>
          </View>
        </View>
      )}

      {!expanded ? (
        <>
          <View style={styles.compactGrid}>
            <View style={styles.compactMetric}>
              <Text style={styles.envelopeLabel}>Envelope</Text>
              <Text style={styles.compactValue}>
                {handoff.envelope.widthMm} x {handoff.envelope.depthMm} x {handoff.envelope.heightMm} mm
              </Text>
            </View>
            <View style={styles.compactMetric}>
              <Text style={styles.envelopeLabel}>CAD lane</Text>
              <Text style={styles.compactValue}>{handoff.aiCadGate.recommendedCadLane.replace(/_/g, ' ')}</Text>
            </View>
            <View style={styles.compactMetric}>
              <Text style={styles.envelopeLabel}>Review lines</Text>
              <Text style={styles.compactValue}>{handoff.partMeasurements.length} parts | {handoff.processPlan.length} gates</Text>
            </View>
          </View>

          <View style={styles.cadGatePanel}>
            <View style={styles.cadGateHeader}>
              <Text style={styles.sectionLabel}>AI CAD Gate</Text>
              <Text style={styles.cadGateStatus}>{handoff.aiCadGate.status.replace(/_/g, ' ')}</Text>
            </View>
            {handoff.aiCadGate.missingInputs.length > 0 ? (
              <Text style={styles.cadGateWarning}>Missing: {handoff.aiCadGate.missingInputs.join(', ')}</Text>
            ) : (
              <Text style={styles.cadGateText}>All required AI CAD inputs are present for the current lane.</Text>
            )}
          </View>

          <View style={styles.boundaryBox}>
            <Ionicons name="shield-checkmark-outline" size={16} color={Colors.orange[300]} />
            <Text style={styles.boundaryText}>{handoff.safetyBoundary}</Text>
          </View>
        </>
      ) : (
        <>

      <View style={styles.canvasShell}>
        {scene && Platform.OS === 'web' ? (
          <ThreeManufacturingViewer scene={scene} />
        ) : (
          <NativeSchematicFallback measurements={primarySceneMeasurements} />
        )}
        <View style={styles.envelopeStrip}>
          <View style={styles.envelopeMetric}>
            <Text style={styles.envelopeLabel}>Width</Text>
            <Text style={styles.envelopeValue}>{handoff.envelope.widthMm} mm</Text>
          </View>
          <View style={styles.envelopeMetric}>
            <Text style={styles.envelopeLabel}>Depth</Text>
            <Text style={styles.envelopeValue}>{handoff.envelope.depthMm} mm</Text>
          </View>
          <View style={styles.envelopeMetric}>
            <Text style={styles.envelopeLabel}>Height</Text>
            <Text style={styles.envelopeValue}>{handoff.envelope.heightMm} mm</Text>
          </View>
        </View>
      </View>

      <Text style={styles.sourceNote}>{handoff.envelope.source}</Text>

      <View style={styles.cadGatePanel}>
        <View style={styles.cadGateHeader}>
          <Text style={styles.sectionLabel}>AI CAD Gate</Text>
          <Text style={styles.cadGateStatus}>{handoff.aiCadGate.status.replace(/_/g, ' ')}</Text>
        </View>
        <Text style={styles.cadGateText}>Lane: {handoff.aiCadGate.recommendedCadLane.replace(/_/g, ' ')}</Text>
        <Text style={styles.cadGateText}>Confidence: {handoff.aiCadGate.confidence}</Text>
        {handoff.aiCadGate.missingInputs.length > 0 && (
          <Text style={styles.cadGateWarning}>Missing: {handoff.aiCadGate.missingInputs.join(', ')}</Text>
        )}
        {handoff.aiCadGate.riskFlags.length > 0 && (
          <Text style={styles.cadGateWarning}>Risks: {handoff.aiCadGate.riskFlags.slice(0, 2).join(' | ')}</Text>
        )}
      </View>

      <View style={styles.datumGrid}>
        {handoff.datumScheme.map(datum => (
          <View key={datum.datum} style={styles.datumItem}>
            <Text style={styles.datumBadge}>{datum.datum}</Text>
            <View style={styles.datumTextWrap}>
              <Text style={styles.datumReference}>{datum.reference}</Text>
              <Text style={styles.datumPurpose}>{datum.purpose}</Text>
            </View>
          </View>
        ))}
      </View>

      {selectedPart && (
        <View style={styles.selectedPartPanel}>
          <View style={styles.selectedPartHeader}>
            <Text style={styles.sectionLabel}>Selected Part</Text>
            <Text style={styles.selectedPartNumber}>{selectedPart.partNumber}</Text>
          </View>
          <Text style={styles.selectedPartTitle}>{selectedPart.partName}</Text>
          <Text style={styles.selectedPartMeasurement}>{dimensionText(selectedPart.nominalDimensionsMm)}</Text>
          <Text style={styles.selectedPartCopy}>{selectedPart.process}</Text>
          <Text style={styles.selectedPartCopy}>Datums: {selectedPart.datumReferences.join(', ')} | {selectedPart.toleranceClass}</Text>
          {selectedTreatment && (
            <Text style={styles.selectedPartCopy}>
              Treatment: {selectedTreatment.treatment} | {selectedTreatment.toleranceImpact}
            </Text>
          )}
        </View>
      )}

      <View style={styles.measurementTable}>
        <View style={styles.tableHeader}>
          <Text style={styles.sectionLabel}>Part Measurement Table</Text>
          <Text style={styles.tableCount}>{handoff.partMeasurements.length} lines</Text>
        </View>
        {handoff.partMeasurements.slice(0, 8).map((item, index) => (
          <View
            key={`${item.partNumber}-${index}`}
            onTouchEnd={() => setSelectedPartIndex(index)}
          >
            <MeasurementRow item={item} />
          </View>
        ))}
      </View>

      {primarySceneMeasurements.length > 0 && (
        <View style={styles.sceneTable}>
          <Text style={styles.sectionLabel}>3D Scene Measurements</Text>
          {primarySceneMeasurements.map(measurement => (
            <View key={measurement.objectId} style={styles.sceneRow}>
              <Text style={styles.sceneLabel} numberOfLines={1}>{measurement.label}</Text>
              <Text style={styles.sceneValue}>{dimensionText(measurement.nominalDimensionsMm)}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.featureSection}>
        <Text style={styles.sectionLabel}>Critical Features</Text>
        <View style={styles.featureGrid}>
          {handoff.criticalFeatures.slice(0, 4).map(feature => (
            <View key={feature.feature} style={styles.featureItem}>
              <Text style={styles.featureTitle}>{feature.feature}</Text>
              <Text style={styles.featureText}>{feature.nominalRequirement}</Text>
              <Text style={styles.featureTolerance}>{feature.tolerance}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.treatmentSection}>
        <Text style={styles.sectionLabel}>Material Treatment Review</Text>
        {handoff.materialTreatmentGuidance.slice(0, 4).map(item => (
          <View key={`${item.partNumber}-treatment`} style={styles.treatmentItem}>
            <Text style={styles.treatmentTitle}>{item.partName}</Text>
            <Text style={styles.treatmentText}>Material: {item.baseMaterial}</Text>
            <Text style={styles.treatmentText}>Treatment: {item.treatment}</Text>
            <Text style={styles.treatmentPurpose}>{item.treatmentPurpose}</Text>
          </View>
        ))}
      </View>

      <View style={styles.processSection}>
        <Text style={styles.sectionLabel}>DfM Review Gates</Text>
        {handoff.processPlan.map(stage => (
          <View key={stage.stage} style={styles.processRow}>
            <Text style={styles.processStage}>{stage.stage}</Text>
            <Text style={styles.processGate}>{stage.acceptanceGate}</Text>
          </View>
        ))}
      </View>

      <View style={styles.boundaryBox}>
        <Ionicons name="shield-checkmark-outline" size={16} color={Colors.orange[300]} />
        <Text style={styles.boundaryText}>{handoff.safetyBoundary}</Text>
      </View>
        </>
      )}
    </View>
  );
}

const createStyles = (Colors: AppColors) => StyleSheet.create({
  panel: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  headerStatic: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primarySoft,
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: Colors.text,
    fontFamily: Fonts.heading,
    fontSize: FontSizes.lg,
  },
  subtitle: {
    color: Colors.dimText,
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
  compactGrid: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  compactMetric: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: Spacing.sm,
  },
  compactValue: {
    color: Colors.text,
    fontSize: FontSizes.sm,
    fontWeight: 'bold',
    marginTop: 2,
  },
  canvasShell: {
    backgroundColor: Colors.black,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  envelopeStrip: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  envelopeMetric: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  envelopeLabel: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  envelopeValue: {
    color: Colors.accent,
    fontSize: FontSizes.sm,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  sourceNote: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  cadGatePanel: {
    backgroundColor: 'rgba(0, 255, 157, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 157, 0.26)',
    borderRadius: 8,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  cadGateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.xs,
  },
  cadGateStatus: {
    color: Colors.accent,
    fontSize: FontSizes.xs,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  cadGateText: {
    color: Colors.gray[300],
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
  cadGateWarning: {
    color: Colors.orange[300],
    fontSize: FontSizes.xs,
    marginTop: Spacing.xs,
  },
  nativeSchematic: {
    height: 300,
    backgroundColor: '#050505',
    position: 'relative',
    overflow: 'hidden',
  },
  schematicAxisX: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    top: '68%',
    height: 1,
    backgroundColor: Colors.gray[700],
  },
  schematicAxisY: {
    position: 'absolute',
    left: '14%',
    top: '12%',
    bottom: '16%',
    width: 1,
    backgroundColor: Colors.gray[700],
  },
  schematicBlock: {
    position: 'absolute',
    borderWidth: 1,
    backgroundColor: 'rgba(0, 255, 157, 0.08)',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
  },
  schematicBlockText: {
    color: Colors.gray[300],
    fontSize: FontSizes.xs,
  },
  datumGrid: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  datumItem: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: Spacing.sm,
  },
  datumBadge: {
    width: 28,
    height: 28,
    lineHeight: 28,
    textAlign: 'center',
    color: Colors.black,
    backgroundColor: Colors.orange[300],
    borderRadius: 6,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  datumTextWrap: {
    flex: 1,
  },
  datumReference: {
    color: Colors.text,
    fontSize: FontSizes.sm,
    fontWeight: 'bold',
  },
  datumPurpose: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
  selectedPartPanel: {
    backgroundColor: 'rgba(0, 255, 157, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 157, 0.26)',
    borderRadius: 8,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  selectedPartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginBottom: Spacing.xs,
  },
  sectionLabel: {
    color: Colors.gray[400],
    fontSize: FontSizes.xs,
    fontWeight: 'bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  selectedPartNumber: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    fontFamily: 'monospace',
  },
  selectedPartTitle: {
    color: Colors.text,
    fontSize: FontSizes.md,
    fontWeight: 'bold',
    marginBottom: Spacing.xs,
  },
  selectedPartMeasurement: {
    color: Colors.accent,
    fontSize: FontSizes.lg,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    marginBottom: Spacing.xs,
  },
  selectedPartCopy: {
    color: Colors.gray[300],
    fontSize: FontSizes.xs,
    lineHeight: 17,
  },
  measurementTable: {
    marginBottom: Spacing.md,
  },
  tableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  tableCount: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    fontFamily: 'monospace',
  },
  measurementRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  measurementMain: {
    flex: 1,
  },
  measurementPart: {
    color: Colors.text,
    fontSize: FontSizes.sm,
    fontWeight: 'bold',
  },
  measurementMeta: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
  measurementValueWrap: {
    width: 168,
    alignItems: 'flex-end',
  },
  measurementValue: {
    color: Colors.orange[300],
    fontSize: FontSizes.xs,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  measurementTolerance: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    marginTop: 2,
    textAlign: 'right',
  },
  sceneTable: {
    marginBottom: Spacing.md,
  },
  sceneRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sceneLabel: {
    flex: 1,
    color: Colors.gray[300],
    fontSize: FontSizes.xs,
  },
  sceneValue: {
    color: Colors.gray[400],
    fontSize: FontSizes.xs,
    fontFamily: 'monospace',
  },
  featureSection: {
    marginBottom: Spacing.md,
  },
  featureGrid: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  featureItem: {
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.22)',
    borderRadius: 8,
    padding: Spacing.md,
  },
  featureTitle: {
    color: Colors.text,
    fontSize: FontSizes.sm,
    fontWeight: 'bold',
    marginBottom: Spacing.xs,
    textTransform: 'capitalize',
  },
  featureText: {
    color: Colors.gray[300],
    fontSize: FontSizes.xs,
    lineHeight: 17,
    marginBottom: Spacing.xs,
  },
  featureTolerance: {
    color: Colors.blue[500],
    fontSize: FontSizes.xs,
  },
  treatmentSection: {
    marginBottom: Spacing.md,
  },
  treatmentItem: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
  },
  treatmentTitle: {
    color: Colors.text,
    fontSize: FontSizes.sm,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  treatmentText: {
    color: Colors.gray[300],
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
  treatmentPurpose: {
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
    marginTop: Spacing.xs,
  },
  processSection: {
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  processRow: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: Spacing.sm,
  },
  processStage: {
    color: Colors.text,
    fontSize: FontSizes.xs,
    fontWeight: 'bold',
    textTransform: 'capitalize',
    marginBottom: 2,
  },
  processGate: {
    color: Colors.gray[400],
    fontSize: FontSizes.xs,
    lineHeight: 16,
  },
  boundaryBox: {
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.25)',
    borderRadius: 8,
    padding: Spacing.md,
  },
  boundaryText: {
    flex: 1,
    color: Colors.gray[300],
    fontSize: FontSizes.xs,
    lineHeight: 17,
  },
});
