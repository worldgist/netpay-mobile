import { useMemo } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import ExpoWebRedirect from "./ExpoWebRedirect";
import UserAuth from "./UserAuth";
import { expoWebRoutes, isExpoWebConfigured } from "@/config/site";

/**
 * Customer auth: Expo web when VITE_EXPO_WEB_URL is a separate host.
 * Otherwise Vite UserAuth. Also handles /auth/login and /auth/signup on Vite.
 */
export default function UserAuthExpoRedirect() {
  const location = useLocation();
  const [params] = useSearchParams();
  const modeParam = (params.get("mode") || "").toLowerCase();
  const pathSuggestsSignup =
    location.pathname.toLowerCase().includes("signup") ||
    location.pathname.toLowerCase().includes("sign-up");
  const isSignup = modeParam === "signup" || modeParam === "sign-up" || pathSuggestsSignup;

  const path = useMemo(
    () => (isSignup ? expoWebRoutes.signup : expoWebRoutes.login),
    [isSignup],
  );

  if (!isExpoWebConfigured) {
    return <UserAuth />;
  }

  return <ExpoWebRedirect path={path} forwardQuery={false} />;
}
