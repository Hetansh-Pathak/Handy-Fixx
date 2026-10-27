import { CalendarCheck, House, UserRound } from "lucide-react-native";
import { Tabs } from "expo-router";
import { tabIcon, tabScreenOptions } from "@/components/tab-options";

export default function CustomerLayout() {
  return (
    <Tabs screenOptions={tabScreenOptions}>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: tabIcon(House) }} />
      <Tabs.Screen name="bookings" options={{ title: "Bookings", tabBarIcon: tabIcon(CalendarCheck) }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: tabIcon(UserRound) }} />
    </Tabs>
  );
}
