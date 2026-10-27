import { Briefcase, House, UserRound, Wallet } from "lucide-react-native";
import { Tabs } from "expo-router";
import { tabIcon, tabScreenOptions } from "@/components/tab-options";

export default function ProviderTabs() {
  return (
    <Tabs screenOptions={tabScreenOptions}>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: tabIcon(House) }} />
      <Tabs.Screen name="jobs" options={{ title: "Jobs", tabBarIcon: tabIcon(Briefcase) }} />
      <Tabs.Screen name="wallet" options={{ title: "Wallet", tabBarIcon: tabIcon(Wallet) }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: tabIcon(UserRound) }} />
    </Tabs>
  );
}
