import type { ImageSourcePropType } from "react-native";

// Our own illustrations (docs/image-credits.md). Bundled, so they work offline and need no URL.
const IMAGES: Record<string, ImageSourcePropType> = {
  "ac-service": require("../../../assets/images/services/ac-service.jpg"),
  "appliance-repair": require("../../../assets/images/services/appliance-repair.jpg"),
  carpentry: require("../../../assets/images/services/carpentry.jpg"),
  cleaning: require("../../../assets/images/services/cleaning.jpg"),
  electrical: require("../../../assets/images/services/electrical.jpg"),
  hvac: require("../../../assets/images/services/hvac.jpg"),
  painting: require("../../../assets/images/services/painting.jpg"),
  "pest-control": require("../../../assets/images/services/pest-control.jpg"),
  plumbing: require("../../../assets/images/services/plumbing.jpg"),
  salon: require("../../../assets/images/services/salon.jpg"),
};

/** The illustration for a service slug, or null (the caller shows the icon tile instead). */
export const serviceImage = (slug: string | null | undefined): ImageSourcePropType | null => (slug ? IMAGES[slug] ?? null : null);
