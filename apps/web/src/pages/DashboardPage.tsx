import { Navigate } from "react-router";
import { ErrorPanel } from "@/components/molecules/ErrorPanel";
import { LoadingPanel } from "@/components/molecules/LoadingPanel";
import { WelcomePanel } from "@/components/organisms/WelcomePanel";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { useSession } from "@/features/session/useSession";

/**
 * Dashboard screen. Redirects to login when there is no stored session.
 *
 * @returns The dashboard page.
 */
export function DashboardPage() {
  const { state, refresh } = useSession();

  return (
    <DashboardLayout>
      {state.status === "loading" ? (
        <LoadingPanel label="Loading your session..." />
      ) : state.status === "disconnected" ? (
        <Navigate to="/" replace />
      ) : state.status === "error" ? (
        <ErrorPanel message={state.message} onRetry={refresh} />
      ) : (
        <WelcomePanel session={state.session} onRefresh={refresh} />
      )}
    </DashboardLayout>
  );
}
