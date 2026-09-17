import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import ExpoWebRedirect from "./ExpoWebRedirect";
import { expoWebRoutes } from "@/config/site";

/** /user/auth → Expo login or signup based on ?mode= */
export default function UserAuthExpoRedirect() {
  const [params] = useSearchParams();
  const mode = (params.get("mode") || "").toLowerCase();
  const path = useMemo(
    () => (mode === "signup" || mode === "sign-up" ? expoWebRoutes.signup : expoWebRoutes.login),
    [mode],
  );

  return (
    <ExpoWebRedirect
      path={path}
      fallbackSitePath={mode === "signup" || mode === "sign-up" ? "/open/signup" : "/open/app"}
      forwardQuery={false}
    />
  );
}
