import { useEffect, useState } from "react";
import { Tabs } from "expo-router";
import { Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAppRole } from "@/contexts/app-role";
import { useColors } from "@/hooks/use-colors";
import { getAppCopy } from "@/lib/app-copy";
import { loadLanguage, type AppLanguage } from "@/lib/language";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { role } = useAppRole();
  const [language, setLanguage] = useState<AppLanguage>("bn");
  const copy = getAppCopy(language);
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 10);
  const isChw = role === "chw";

  useEffect(() => {
    void loadLanguage().then(setLanguage).catch(() => setLanguage("bn"));
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarButton: HapticTab,
        tabBarLabelStyle: styles.label,
        tabBarStyle: {
          paddingTop: 8,
          paddingBottom: bottomPadding,
          height: 58 + bottomPadding,
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarItemStyle: styles.item,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: copy.tabHome,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="care"
        options={{
          title: copy.tabCare,
          href: isChw ? null : "/care",
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="calendar" color={color} />,
        }}
      />
      <Tabs.Screen
        name="queue"
        options={{
          title: copy.tabQueue,
          href: isChw ? "/queue" : null,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="person.2.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: copy.tabSettings,
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="gearshape.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 11, fontWeight: "700", marginTop: 2 },
  item: { paddingTop: 2 },
});
