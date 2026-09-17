import { type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

/**
 * Customer wallet is Expo web; Vite serves marketing + admin only.
 * Path blocking is unused — `/user/*` redirects to Expo in App routes.
 */
export function WebHostAccessGuard({ children }: Props) {
  return <>{children}</>;
}
