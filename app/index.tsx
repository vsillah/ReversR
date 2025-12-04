import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Image,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Spacing, FontSizes } from "../constants/theme";
import WelcomeScreen from "../components/WelcomeScreen";
import PhaseOne from "../components/PhaseOne";
import PhaseTwo from "../components/PhaseTwo";
import PhaseThree from "../components/PhaseThree";
import HistoryScreen from "../components/HistoryScreen";
import {
  AnalysisResult,
  InnovationResult,
  TechnicalSpec,
  ThreeDSceneDescriptor,
  SITPattern,
  BillOfMaterials,
} from "../hooks/useGemini";
import {
  SavedInnovation,
  saveInnovation,
  createNewInnovation,
} from "../hooks/useStorage";

interface MutationContext {
  id: string;
  createdAt: string;
  phase: number;
  input: string;
  analysis: AnalysisResult | null;
  selectedPattern: SITPattern | null;
  innovation: InnovationResult | null;
  spec: TechnicalSpec | null;
  threeDScene: ThreeDSceneDescriptor | null;
  imageUrl: string | null;
  bom: BillOfMaterials | null;
}

const createEmptyContext = (): MutationContext => {
  const newInnovation = createNewInnovation();
  return {
    id: newInnovation.id,
    createdAt: newInnovation.createdAt,
    phase: 1,
    input: "",
    analysis: null,
    selectedPattern: null,
    innovation: null,
    spec: null,
    threeDScene: null,
    imageUrl: null,
    bom: null,
  };
};

export default function HomeScreen() {
  const [started, setStarted] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [context, setContext] = useState<MutationContext>(createEmptyContext());
  const [isLoading, setIsLoading] = useState(false);

  const autoSave = useCallback(async (ctx: MutationContext) => {
    if (ctx.phase > 1 || ctx.input) {
      const toSave: SavedInnovation = {
        id: ctx.id,
        createdAt: ctx.createdAt,
        updatedAt: new Date().toISOString(),
        phase: ctx.phase,
        input: ctx.input,
        analysis: ctx.analysis,
        selectedPattern: ctx.selectedPattern,
        innovation: ctx.innovation,
        spec: ctx.spec,
        threeDScene: ctx.threeDScene,
        imageUrl: ctx.imageUrl,
        bom: ctx.bom,
      };
      await saveInnovation(toSave);
    }
  }, []);

  const handlePhaseOneComplete = async (input: string, analysis: AnalysisResult) => {
    const newContext = {
      ...context,
      input,
      analysis,
      phase: 2,
    };
    setContext(newContext);
    await autoSave(newContext);
  };

  const handlePhaseTwoComplete = async (innovation: InnovationResult) => {
    const newContext = {
      ...context,
      innovation,
      selectedPattern: innovation.patternUsed,
      phase: 3,
    };
    setContext(newContext);
    await autoSave(newContext);
  };

  const handlePhaseThreeComplete = async (
    spec: TechnicalSpec,
    scene: ThreeDSceneDescriptor | null,
    imageUrl: string | null,
    bom?: BillOfMaterials | null
  ) => {
    const newContext = {
      ...context,
      spec,
      threeDScene: scene,
      imageUrl,
      bom: bom || null,
    };
    setContext(newContext);
    await autoSave(newContext);
  };

  const handleReset = () => {
    setContext(createEmptyContext());
  };

  const handleStartNew = () => {
    setContext(createEmptyContext());
    setShowHistory(false);
    setStarted(true);
  };

  const handleResume = (saved: SavedInnovation) => {
    setContext({
      id: saved.id,
      createdAt: saved.createdAt,
      phase: saved.phase,
      input: saved.input,
      analysis: saved.analysis,
      selectedPattern: saved.selectedPattern,
      innovation: saved.innovation,
      spec: saved.spec,
      threeDScene: saved.threeDScene,
      imageUrl: saved.imageUrl,
      bom: saved.bom,
    });
    setShowHistory(false);
    setStarted(true);
  };

  const openHistory = useCallback(() => {
    setHistoryRefreshKey(prev => prev + 1);
    setShowHistory(true);
    setStarted(true);
  }, []);

  if (!started) {
    return (
      <WelcomeScreen
        onStart={handleStartNew}
        onHistory={openHistory}
      />
    );
  }

  if (showHistory) {
    return (
      <HistoryScreen
        onBack={() => setShowHistory(false)}
        onResume={handleResume}
        refreshKey={historyRefreshKey}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Image
            source={require("../assets/logo-transparent.png")}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <View>
            <Text style={styles.title}>
              REVERS<Text style={styles.titleAccent}>R</Text>
            </Text>
            <Text style={styles.subtitle}>SYSTEMATIC INVENTIVE THINKING</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.historyButton}
          onPress={openHistory}
        >
          <Ionicons name="time-outline" size={24} color={Colors.gray[400]} />
        </TouchableOpacity>
      </View>

      <View style={styles.progressBar}>
        {[1, 2, 3].map((step) => (
          <View key={step} style={styles.stepContainer}>
            <View
              style={[
                styles.stepCircle,
                context.phase >= step && styles.stepCircleActive,
                context.phase > step && styles.stepCircleComplete,
              ]}
            >
              <Text
                style={[
                  styles.stepNumber,
                  context.phase >= step && styles.stepNumberActive,
                ]}
              >
                {step}
              </Text>
            </View>
            <Text
              style={[
                styles.stepLabel,
                context.phase >= step && styles.stepLabelActive,
              ]}
            >
              {step === 1 ? "SCAN" : step === 2 ? "MUTATE" : "ARCHITECT"}
            </Text>
          </View>
        ))}
        <View style={styles.progressLine} />
        <View
          style={[
            styles.progressLineFill,
            { width: `${((context.phase - 1) / 2) * 100}%` },
          ]}
        />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {context.phase === 1 && (
          <PhaseOne
            onComplete={handlePhaseOneComplete}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
          />
        )}
        {context.phase === 2 && context.analysis && (
          <PhaseTwo
            analysis={context.analysis}
            onComplete={handlePhaseTwoComplete}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            onReset={handleReset}
          />
        )}
        {context.phase === 3 && context.innovation && (
          <PhaseThree
            innovation={context.innovation}
            onComplete={handlePhaseThreeComplete}
            onReset={handleReset}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.panel,
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  headerLogo: {
    width: 56,
    height: 56,
  },
  title: {
    fontFamily: "monospace",
    fontSize: FontSizes.xl,
    fontWeight: "bold",
    color: Colors.white,
    letterSpacing: 2,
  },
  titleAccent: {
    color: Colors.accent,
  },
  subtitle: {
    fontSize: FontSizes.xs,
    color: Colors.dim,
    letterSpacing: 3,
  },
  historyButton: {
    padding: Spacing.sm,
  },
  progressBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    position: "relative",
  },
  stepContainer: {
    alignItems: "center",
    zIndex: 1,
  },
  stepCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.black,
    borderWidth: 2,
    borderColor: Colors.gray[800],
    justifyContent: "center",
    alignItems: "center",
  },
  stepCircleActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  stepCircleComplete: {
    backgroundColor: Colors.green[500],
    borderColor: Colors.green[500],
  },
  stepNumber: {
    fontFamily: "monospace",
    fontSize: FontSizes.sm,
    fontWeight: "bold",
    color: Colors.gray[600],
  },
  stepNumberActive: {
    color: Colors.black,
  },
  stepLabel: {
    marginTop: Spacing.xs,
    fontSize: FontSizes.xs,
    fontWeight: "bold",
    color: Colors.gray[700],
    letterSpacing: 1,
  },
  stepLabelActive: {
    color: Colors.white,
  },
  progressLine: {
    position: "absolute",
    top: 44,
    left: 60,
    right: 60,
    height: 2,
    backgroundColor: Colors.gray[900],
    zIndex: 0,
  },
  progressLineFill: {
    position: "absolute",
    top: 44,
    left: 60,
    height: 2,
    backgroundColor: Colors.accent,
    zIndex: 0,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
});
