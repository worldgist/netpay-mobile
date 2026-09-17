import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import ExpoWebRedirect from "./ExpoWebRedirect";
import UserAuth from "./UserAuth";
import { expoWebRoutes, isExpoWebConfigured } from "@/config/site";

/**
 * Customer auth: Expo web when VITE_EXPO_WEB_URL is set.
 * Otherwise Vite UserAuth (never the /open/app native interstitial).
 */
export default function UserAuthExpoRedirect() {
  const [params] = useSearchParams();
  const mode = (params.get("mode") || "").toLowerCase();
  const path = useMemo(
    () => (mode === "signup" || mode === "sign-up" ? expoWebRoutes.signup : expoWebRoutes.login),
    [mode],
  );

  if (!isExpoWebConfigured) {
    return <UserAuth />;
  }

  return <ExpoWebRedirect path={path} forwardQuery={false} />;
}
