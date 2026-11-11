import { Navigate, useNavigate } from "react-router";
import { MailSetupBanner } from "@/components/molecules/MailSetupBanner";
import { ErrorPanel } from "@/components/molecules/ErrorPanel";
import { LoadingPanel } from "@/components/molecules/LoadingPanel";
import { WelcomePanel } from "@/components/organisms/WelcomePanel";
import { DashboardLayout } from "@/components/templates/DashboardLayout";
import { useMailStatus } from "@/features/mail/useMailStatus";
import { useSession } from "@/features/session/useSession";

/**
 * Dashboard screen. Redirects to login when there is no stored session.
 *
 * @returns The dashboard page.
 */
export function DashboardPage() {
  const { state, refresh } = useSession();
  const mail = useMailStatus();
  const navigate = useNavigate();
  const showMailBanner =
    state.status === "connected" && mail.state.status === "ready" && !mail.state.mail.connected;

  return (
    <DashboardLayout>
      {showMailBanner ? (
        <div className="mb-6">
          <MailSetupBanner onConnect={() => navigate("/setup/mail")} />
        </div>
      ) : null}

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
