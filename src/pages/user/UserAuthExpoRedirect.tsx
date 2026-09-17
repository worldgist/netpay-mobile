import { useMemo } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import ExpoWebRedirect from "./ExpoWebRedirect";
import UserAuth from "./UserAuth";
import { expoWebRoutes, shouldRedirectToExpoWeb } from "@/config/site";

/**
 * Customer auth: Expo web only when VITE_EXPO_WEB_URL is a different live host.
 * If Expo URL points at this same Vite deployment, show UserAuth (no redirect loop).
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

  if (!shouldRedirectToExpoWeb()) {
    return <UserAuth />;
  }

  return <ExpoWebRedirect path={path} forwardQuery={false} />;
}
