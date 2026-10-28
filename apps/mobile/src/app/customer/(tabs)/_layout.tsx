import { CalendarCheck, House, LayoutGrid, UserRound } from "lucide-react-native";
import { Tabs } from "expo-router";
import { tabIcon, useTabScreenOptions } from "@/components/tab-options";

export default function CustomerLayout() {
  const screenOptions = useTabScreenOptions();
  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: tabIcon(House) }} />
      <Tabs.Screen name="services" options={{ title: "Services", tabBarIcon: tabIcon(LayoutGrid) }} />
      <Tabs.Screen name="bookings" options={{ title: "Bookings", tabBarIcon: tabIcon(CalendarCheck) }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: tabIcon(UserRound) }} />
    </Tabs>
  );
}
