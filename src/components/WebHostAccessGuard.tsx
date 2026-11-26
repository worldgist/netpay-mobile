import { type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

/** Passthrough — marketing, admin, and customer Vite UIs share this host. */
export function WebHostAccessGuard({ children }: Props) {
  return <>{children}</>;
}
