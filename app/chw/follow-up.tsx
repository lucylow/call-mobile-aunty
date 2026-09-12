import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useUiTints } from "@/hooks/use-ui-tints";
import { completeFollowUp, type FollowUpDraft } from "@/lib/follow-up";
import { clearFollowUpDraft, loadFollowUpDraft, saveCompletedFollowUp, saveFollowUpDraft } from "@/lib/follow-up-store";
import { enqueueFollowUp } from "@/lib/sync-queue";
import { getFollowUpCopy } from "@/lib/app-copy";
import { loadLanguage, type AppLanguage } from "@/lib/language";

export default function FollowUpScreen() {
  const colors = useColors();
  const tints = useUiTints();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [draft, setDraft] = useState<FollowUpDraft>({ womanId: id ?? "", contactMethod: "phone", outcome: "reached", note: "", nextAction: "call_again", status: "draft" });
  const [restored, setRestored] = useState(false);
  const [draftSaveFailed, setDraftSaveFailed] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>("bn");
  const copy = getFollowUpCopy(language);
  useEffect(() => {
    void loadLanguage().then(setLanguage).catch(() => setLanguage("bn"));
  }, []);
  useEffect(() => {
    if (!id) return;
    void loadFollowUpDraft(id).then((saved) => {
      if (saved) {
        setDraft(saved);
        setRestored(true);
      }
    }).catch(() => {
      setRestored(false);
    });
  }, [id]);
  const error = useMemo(() => (draft.note.trim() || draft.outcome === "no_answer" ? null : copy.noteRequired), [copy.noteRequired, draft.note, draft.outcome]);
  const set = <K extends keyof FollowUpDraft>(key: K, value: FollowUpDraft[K]) => setDraft((current) => {
    const next = { ...current, [key]: value };
    void saveFollowUpDraft(next).then(() => setDraftSaveFailed(false)).catch(() => setDraftSaveFailed(true));
    return next;
  });
  async function submit() {
    try {
      const completed = completeFollowUp(draft);
      await saveCompletedFollowUp(completed);
      await enqueueFollowUp(completed);
      try {
        await clearFollowUpDraft(draft.womanId);
      } catch {
        // The completed follow-up and sync queue are already durable; a stale draft is safe to clean up later.
      }
      Alert.alert(copy.savedTitle, copy.savedBody, [{ text: copy.done, onPress: () => router.back() }]);
    } catch {
      Alert.alert(copy.saveErrorTitle, copy.saveErrorBody);
    }
  }
  return (
    <ScreenContainer className="px-5" containerClassName="bg-background">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable accessibilityRole="button" accessibilityLabel={copy.back} onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <IconSymbol name="chevron.right" size={18} color={colors.foreground} style={{ transform: [{ rotate: "180deg" }] }} />
          <Text style={[styles.backText, { color: colors.foreground }]}>{copy.back}</Text>
        </Pressable>
        <Text style={[styles.eyebrow, { color: colors.coral }]}>{copy.eyebrow}</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>{copy.title(id ?? "this woman")}</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>{copy.subtitle}</Text>
        {restored && (
          <View style={[styles.statusChip, { backgroundColor: tints.mintSoft }]}>
            <Text accessibilityLiveRegion="polite" style={[styles.restored, { color: colors.success }]}>{copy.restored}</Text>
          </View>
        )}
        {draftSaveFailed && (
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.helper, { color: colors.error }]}>{copy.saveErrorBody}</Text>
        )}
        <Text style={[styles.section, { color: colors.foreground }]}>{copy.contactMethod}</Text>
        <ChoiceRow options={["visit", "phone", "sms"]} labels={copy.contactOptions} selected={draft.contactMethod} onSelect={(value) => set("contactMethod", value as FollowUpDraft["contactMethod"])} colors={colors} />
        <Text style={[styles.section, { color: colors.foreground }]}>{copy.outcome}</Text>
        <ChoiceRow
          options={["reached", "no_answer", "needs_clinician"]}
          labels={copy.outcomeOptions}
          selected={draft.outcome}
          onSelect={(value) => {
            const outcome = value as FollowUpDraft["outcome"];
            set("outcome", outcome);
            if (outcome === "needs_clinician") set("nextAction", "urgent_review");
          }}
          colors={colors}
        />
        <Text style={[styles.section, { color: colors.foreground }]}>{copy.note}</Text>
        <TextInput
          accessibilityLabel={copy.noteLabel}
          value={draft.note}
          onChangeText={(value) => set("note", value)}
          placeholder={copy.notePlaceholder}
          placeholderTextColor={colors.muted}
          multiline
          style={[styles.input, { color: colors.foreground, backgroundColor: colors.surface, borderColor: error ? colors.error : colors.border }]}
        />
        <Text style={[styles.helper, { color: error ? colors.error : colors.muted }]}>{error ?? copy.noteHelper}</Text>
        <Text style={[styles.section, { color: colors.foreground }]}>{copy.nextAction}</Text>
        <ChoiceRow options={["call_again", "clinic_visit", "urgent_review", "none"]} labels={copy.actionOptions} selected={draft.nextAction} onSelect={(value) => set("nextAction", value as FollowUpDraft["nextAction"])} colors={colors} />
        <Pressable accessibilityRole="button" accessibilityLabel={copy.saveLabel} onPress={submit} style={({ pressed }) => [styles.submit, { backgroundColor: colors.primary }, pressed && styles.pressed]}>
          <Text style={styles.submitText}>{copy.save}</Text>
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

function ChoiceRow({
  options,
  labels,
  selected,
  onSelect,
  colors,
}: {
  options: string[];
  labels: Record<string, string>;
  selected: string;
  onSelect: (value: string) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.choiceWrap}>
      {options.map((option) => {
        const active = selected === option;
        return (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityLabel={labels[option] ?? option}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(option)}
            style={[
              styles.choice,
              {
                backgroundColor: active ? colors.primary : colors.surface,
                borderColor: active ? colors.primary : colors.border,
              },
            ]}
          >
            <Text style={[styles.choiceText, { color: active ? colors.surface : colors.foreground }]}>{labels[option] ?? option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 36, gap: 14 },
  back: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 },
  backText: { fontWeight: "800", fontSize: 14 },
  eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.3, textTransform: "uppercase" },
  title: { fontSize: 28, lineHeight: 34, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 15, lineHeight: 22, marginTop: -4 },
  section: { fontSize: 17, fontWeight: "800", marginTop: 8, letterSpacing: -0.2 },
  choiceWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11 },
  choiceText: { fontSize: 13, fontWeight: "800", textTransform: "capitalize" },
  input: { minHeight: 120, borderRadius: 18, borderWidth: 1, padding: 15, fontSize: 15, lineHeight: 22, textAlignVertical: "top" },
  helper: { fontSize: 12, lineHeight: 18, marginTop: -4 },
  statusChip: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  restored: { fontSize: 12, fontWeight: "800" },
  submit: { borderRadius: 18, alignItems: "center", paddingVertical: 17, marginTop: 10 },
  submitText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
});
