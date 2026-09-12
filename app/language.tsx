import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useLanguage } from "@/contexts/language-context";
import { useColors } from "@/hooks/use-colors";
import { useUiTints } from "@/hooks/use-ui-tints";
import { listLanguagesForPicker } from "@/lib/i18n";
import type { AppLanguage } from "@/lib/language";
import { getLanguageOption } from "@/lib/language";

const EXAMPLES: Record<AppLanguage, string> = {
  bn: "আসসালামু আলাইকুম — আজকের চেক-ইন শুরু করুন",
  en: "Good morning — start today’s check-in",
  hi: "नमस्ते — आज की जाँच शुरू करें",
  ur: "السلام علیکم — آج کی جانچ شروع کریں",
  ta: "வணக்கம் — இன்றைய சரிபார்ப்பைத் தொடங்குங்கள்",
  te: "నమస్కారం — నేటి చెక్-ఇన్ ప్రారంభించండి",
};

export default function LanguageScreen() {
  const colors = useColors();
  const tints = useUiTints();
  const { language, direction, setUiLanguage, translate } = useLanguage();
  const [query, setQuery] = useState("");

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return listLanguagesForPicker().filter((row) => {
      if (!q) return true;
      return (
        row.code.includes(q) ||
        row.displayName.toLowerCase().includes(q) ||
        row.nativeDisplayName.toLowerCase().includes(q)
      );
    });
  }, [query]);

  async function select(next: AppLanguage) {
    await setUiLanguage(next);
    router.back();
  }

  return (
    <ScreenContainer className="px-5" containerClassName="bg-background">
      <ScrollView
        contentContainerStyle={[styles.content, { direction }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={() => router.back()} style={styles.backRow}>
          <IconSymbol name="chevron.left" size={18} color={colors.coral} />
          <Text style={{ color: colors.coral }}>{translate("common.back")}</Text>
        </Pressable>

        <Text style={[styles.title, { color: colors.foreground }]}>
          {translate("settings.chooseLanguage")}
        </Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          {translate("settings.chooseLanguageBody")}
        </Text>
        <Text style={[styles.note, { color: colors.muted }]}>
          {translate("settings.translationPartial")}
        </Text>
        <Text style={[styles.note, { color: colors.muted }]}>
          {translate("calls.uiNotCallLanguage")}
        </Text>

        <TextInput
          accessibilityLabel={translate("common.search")}
          placeholder={translate("common.search")}
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
          style={[
            styles.search,
            { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface },
          ]}
        />

        {options.map((row) => {
          const selected = language === row.code;
          const englishName = getLanguageOption(row.code).englishName;
          return (
            <Pressable
              key={row.code}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${row.nativeDisplayName}, ${englishName}`}
              onPress={() => void select(row.code)}
              style={[
                styles.option,
                {
                  borderColor: selected ? colors.coral : colors.border,
                  backgroundColor: selected ? tints.lavenderSoft : colors.surface,
                },
              ]}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.native, { color: colors.foreground }]}>{row.nativeDisplayName}</Text>
                <Text style={[styles.english, { color: colors.muted }]}>{englishName}</Text>
                <Text style={[styles.example, { color: colors.muted }]}>{EXAMPLES[row.code]}</Text>
                <View style={styles.metaRow}>
                  <Text style={[styles.badge, { color: colors.primary }]}>
                    {row.translationStatus === "complete"
                      ? "✓"
                      : row.translationStatus === "partial"
                        ? "~"
                        : "…"}
                    {" "}
                    {row.translationStatus}
                  </Text>
                  {row.offlinePackAvailable ? (
                    <Text style={[styles.badge, { color: colors.success }]}>offline</Text>
                  ) : null}
                  {row.direction === "rtl" ? (
                    <Text style={[styles.badge, { color: colors.warning }]}>RTL</Text>
                  ) : null}
                </View>
              </View>
              {selected ? (
                <Text style={[styles.selected, { color: colors.coral }]}>
                  {translate("common.current")}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 10, paddingBottom: 40, gap: 12 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 },
  title: { fontSize: 28, fontWeight: "800", letterSpacing: -0.4 },
  subtitle: { fontSize: 15, lineHeight: 22 },
  note: { fontSize: 13, lineHeight: 18 },
  search: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  option: { borderWidth: 1, borderRadius: 16, padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  native: { fontSize: 20, fontWeight: "800" },
  english: { fontSize: 13 },
  example: { fontSize: 13, lineHeight: 18, fontStyle: "italic" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  badge: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  selected: { fontSize: 12, fontWeight: "800" },
});
