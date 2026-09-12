import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useUiTints } from "@/hooks/use-ui-tints";
import { getAppCopy, getChwDashboardAccessibilityCopy } from "@/lib/app-copy";
import { loadLanguage, type AppLanguage } from "@/lib/language";

const queue = [
  { id: "rina", tone: "urgent" as const },
  { id: "shahana", tone: "attention" as const },
  { id: "mousumi", tone: "routine" as const },
];

export default function QueueScreen() {
  const colors = useColors();
  const tints = useUiTints();
  const [language, setLanguage] = useState<AppLanguage>("bn");
  const copy = useMemo(() => getAppCopy(language), [language]);
  const a11y = useMemo(() => getChwDashboardAccessibilityCopy(language), [language]);

  useEffect(() => {
    void loadLanguage().then(setLanguage).catch(() => setLanguage("bn"));
  }, []);

  return (
    <ScreenContainer className="px-5" containerClassName="bg-background">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.eyebrow, { color: colors.coral }]}>{copy.fieldQueue}</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>{copy.prioritizedQueue}</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>{copy.openQueueBody}</Text>

        <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View>
            <Text style={[styles.heroOverline, { color: colors.coral }]}>{copy.fieldQueue}</Text>
            <Text style={[styles.heroCount, { color: colors.foreground }]}>
              {queue.length} {copy.actions}
            </Text>
            <Text style={[styles.meta, { color: colors.muted }]}>{copy.urgentCase}</Text>
          </View>
          <View style={[styles.iconCircle, { backgroundColor: tints.coralSoft }]}>
            <IconSymbol name="person.2.fill" size={25} color={colors.coral} />
          </View>
        </View>

        {queue.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <IconSymbol name="checkmark.circle.fill" size={24} color={colors.success} />
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>{copy.queueClear}</Text>
            <Text style={[styles.meta, { color: colors.muted }]}>{copy.queueClearBody}</Text>
          </View>
        ) : (
          queue.map((item, index) => {
            const record = copy.chwQueue[index];
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`${record.name}. ${record.urgency}. ${record.meta}. ${record.nextAction}`}
                accessibilityHint={a11y.openQueueRecord}
                onPress={() => router.push({ pathname: "/chw/[id]", params: { id: item.id } })}
                style={({ pressed }) => [
                  styles.card,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  pressed && styles.pressed,
                ]}
              >
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor:
                        item.tone === "urgent" ? colors.error : item.tone === "attention" ? colors.warning : colors.success,
                    },
                  ]}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]}>{record.name}</Text>
                  <Text
                    style={[
                      styles.meta,
                      {
                        color:
                          item.tone === "urgent" ? colors.error : item.tone === "attention" ? colors.warning : colors.success,
                      },
                    ]}
                  >
                    {record.urgency}
                  </Text>
                  <Text style={[styles.meta, { color: colors.muted }]}>
                    {record.meta} · {record.nextAction}
                  </Text>
                </View>
                <IconSymbol name="chevron.right" size={18} color={colors.muted} />
              </Pressable>
            );
          })
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.chwNewFollowUp}
          accessibilityHint={a11y.newFollowUp}
          onPress={() => router.push("/chw/follow-up")}
          style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary }, pressed && styles.pressed]}
        >
          <View>
            <Text style={styles.primaryTitle}>{copy.captureFollowUp}</Text>
            <Text style={styles.primarySub}>{copy.captureFollowUpBody}</Text>
          </View>
          <IconSymbol name="chevron.right" size={22} color="#FFFFFF" />
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 14, paddingBottom: 32, gap: 14 },
  eyebrow: { fontSize: 12, fontWeight: "800", letterSpacing: 1.3, textTransform: "uppercase" },
  title: { fontSize: 29, fontWeight: "800", letterSpacing: -0.6 },
  subtitle: { fontSize: 15, lineHeight: 22, marginTop: -6 },
  hero: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  heroOverline: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, textTransform: "uppercase" },
  heroCount: { fontSize: 30, fontWeight: "800", marginTop: 4 },
  iconCircle: { width: 58, height: 58, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  card: { borderRadius: 18, borderWidth: 1, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  cardTitle: { fontSize: 15, fontWeight: "800" },
  meta: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  empty: { borderRadius: 18, borderWidth: 1, padding: 18, alignItems: "center", gap: 5 },
  primary: {
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  primaryTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  primarySub: { color: "#E7E6FF", fontSize: 12, marginTop: 4 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
});
