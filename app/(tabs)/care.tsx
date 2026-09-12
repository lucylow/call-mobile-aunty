import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { InfoSheet } from "@/components/call-aunty/info-sheet";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useUiTints } from "@/hooks/use-ui-tints";
import { openPhoneHandoff } from "@/lib/contact-handoff";
import { loadLanguage, type AppLanguage } from "@/lib/language";
import { getCareCopy, getCarePlanCards, getSharedCopy } from "@/lib/app-copy";
import { getOfflineCareCopy, getOfflineCareMessage } from "@/lib/offline-care-copy";
import { getOfflineCareFreshness, loadOfflineCareSnapshot, saveOfflineCareSnapshot, type OfflineCareFreshness } from "@/lib/offline-care-snapshot";

const planIcons = ["calendar", "checkmark.circle.fill", "phone.fill"] as const;
const planTones = ["upcoming", "safe", "scheduled"] as const;

export default function CareScreen() {
  const colors = useColors();
  const tints = useUiTints();
  const [language, setLanguage] = useState<AppLanguage>("bn");
  const [offlineFreshness, setOfflineFreshness] = useState<OfflineCareFreshness>("missing");
  const [planSheet, setPlanSheet] = useState<{ title: string; body: string } | null>(null);
  const [callSheetOpen, setCallSheetOpen] = useState(false);

  useEffect(() => {
    void loadLanguage().then(setLanguage).catch(() => setLanguage("bn"));
    void loadOfflineCareSnapshot().then((snapshot) => setOfflineFreshness(getOfflineCareFreshness(snapshot))).catch(() => setOfflineFreshness("missing"));
  }, []);

  const copy = getCareCopy(language);
  const shared = getSharedCopy(language);
  const offlineCopy = getOfflineCareCopy(language);
  const plans = getCarePlanCards(language).map((plan, index) => ({ ...plan, icon: planIcons[index], tone: planTones[index] }));

  async function saveCarePlanOffline() {
    try {
      const snapshot = await saveOfflineCareSnapshot(language);
      if (!snapshot) {
        Alert.alert(offlineCopy.title, offlineCopy.unavailable);
        return;
      }
      setOfflineFreshness("available");
      Alert.alert(offlineCopy.title, offlineCopy.saved);
    } catch {
      Alert.alert(offlineCopy.title, offlineCopy.unavailable);
    }
  }

  async function confirmCallHandoff() {
    setCallSheetOpen(false);
    const opened = await openPhoneHandoff();
    if (!opened) {
      Alert.alert(shared.callHandoffTitle, shared.callHandoffBody);
    }
  }

  const offlineTone = offlineFreshness === "stale" ? colors.warning : colors.success;
  const offlineBg = offlineFreshness === "stale" ? tints.amberSoft : tints.mintSoft;

  return (
    <ScreenContainer className="px-5" containerClassName="bg-background">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.eyebrow, { color: colors.coral }]}>{copy.eyebrow}</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>{copy.title}</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>{copy.subtitle}</Text>

        <View accessibilityRole="summary" accessibilityLiveRegion="polite" style={[styles.offlineBanner, { backgroundColor: offlineBg }]}>
          <View style={[styles.bannerAccent, { backgroundColor: offlineTone }]} />
          <IconSymbol name="checkmark.circle.fill" size={18} color={offlineTone} />
          <Text style={[styles.offlineText, { color: offlineTone, flex: 1 }]}>{offlineCopy.title}: {getOfflineCareMessage(language, offlineFreshness)}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={offlineCopy.refresh} onPress={() => void saveCarePlanOffline()}>
            <Text style={[styles.call, { color: offlineTone }]}>{offlineCopy.refresh}</Text>
          </Pressable>
        </View>

        <View style={[styles.stageCard, { backgroundColor: colors.primary }]}>
          <View style={styles.stageGlow} />
          <View style={styles.stageCopy}>
            <Text style={[styles.stageLabel, { color: tints.heroOverline }]}>{copy.journey}</Text>
            <Text style={styles.stageTitle}>{copy.stageTitle}</Text>
            <Text style={[styles.stageMeta, { color: tints.heroBody }]}>{copy.stageMeta}</Text>
          </View>
          <View style={[styles.stageCircle, { backgroundColor: colors.coral }]}>
            <IconSymbol name="heart.fill" size={25} color="#FFFFFF" />
          </View>
        </View>

        <Text style={[styles.section, { color: colors.foreground }]}>{copy.upcoming}</Text>
        {plans.map((plan) => {
          const safe = plan.tone === "safe";
          return (
            <Pressable
              key={plan.title}
              accessibilityRole="button"
              accessibilityLabel={`${plan.title}. ${plan.accessibilitySummary}`}
              accessibilityHint={copy.sharedPlan}
              onPress={() => setPlanSheet({ title: plan.title, body: `${plan.meta}\n\n${copy.sharedPlan}` })}
              style={({ pressed }) => [styles.planCard, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}
            >
              <View style={[styles.planIcon, { backgroundColor: safe ? tints.mintSoft : tints.coralSoft }]}>
                <IconSymbol name={plan.icon} size={21} color={safe ? colors.success : colors.coral} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.planTitle, { color: colors.foreground }]}>{plan.title}</Text>
                <Text style={[styles.planMeta, { color: colors.muted }]}>{plan.meta}</Text>
              </View>
              <Text style={[styles.state, { color: safe ? colors.success : colors.primary }]}>{plan.state}</Text>
            </Pressable>
          );
        })}

        <View style={[styles.referral, { backgroundColor: tints.coralSoft }]}>
          <IconSymbol name="person.2.fill" size={21} color={colors.coral} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.planTitle, { color: colors.foreground }]}>{copy.healthWorker}</Text>
            <Text style={[styles.planMeta, { color: colors.muted }]}>{copy.referralMeta}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={copy.call} onPress={() => setCallSheetOpen(true)}>
            <Text style={[styles.call, { color: colors.coral }]}>{copy.call}</Text>
          </Pressable>
        </View>
      </ScrollView>

      <InfoSheet
        visible={planSheet !== null}
        title={planSheet?.title ?? ""}
        body={planSheet?.body ?? ""}
        primaryLabel={copy.call}
        secondaryLabel={shared.close ?? "Close"}
        primaryTone="coral"
        onPrimary={() => {
          setPlanSheet(null);
          setCallSheetOpen(true);
        }}
        onClose={() => setPlanSheet(null)}
      />
      <InfoSheet
        visible={callSheetOpen}
        title={shared.callHandoffTitle}
        body={shared.callHandoffBody}
        primaryLabel={copy.call}
        secondaryLabel={shared.close ?? "Close"}
        primaryTone="coral"
        onPrimary={() => void confirmCallHandoff()}
        onClose={() => setCallSheetOpen(false)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 36, gap: 15 },
  eyebrow: { fontSize: 12, fontWeight: "800", letterSpacing: 1.5, textTransform: "uppercase" },
  title: { fontSize: 30, fontWeight: "800", letterSpacing: -0.7 },
  subtitle: { fontSize: 15, lineHeight: 22, marginTop: -6 },
  stageCard: {
    borderRadius: 26,
    padding: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    overflow: "hidden",
    position: "relative",
  },
  stageGlow: {
    position: "absolute",
    right: -36,
    top: -36,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  stageCopy: { zIndex: 1 },
  stageLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.3, textTransform: "uppercase" },
  stageTitle: { color: "#FFFFFF", fontSize: 32, fontWeight: "800", marginTop: 8, letterSpacing: -0.6 },
  stageMeta: { fontSize: 13, marginTop: 4 },
  stageCircle: { width: 54, height: 54, borderRadius: 20, alignItems: "center", justifyContent: "center", zIndex: 1 },
  section: { fontSize: 18, fontWeight: "800", marginTop: 6, letterSpacing: -0.2 },
  planCard: { borderRadius: 20, borderWidth: 1, padding: 15, flexDirection: "row", alignItems: "center", gap: 12 },
  planIcon: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  planTitle: { fontSize: 15, fontWeight: "800" },
  planMeta: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  state: { fontSize: 11, fontWeight: "800" },
  referral: { borderRadius: 20, padding: 16, flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 },
  call: { fontWeight: "800", fontSize: 14 },
  offlineBanner: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingRight: 13,
    paddingLeft: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    overflow: "hidden",
  },
  bannerAccent: { width: 4, alignSelf: "stretch", borderRadius: 4, marginVertical: -4, marginLeft: -2 },
  offlineText: { fontSize: 12, lineHeight: 17 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
});
