import { Navigate } from "react-router";
import { ErrorPanel } from "@/components/molecules/ErrorPanel";
import { LoadingPanel } from "@/components/molecules/LoadingPanel";
import { BankPicker } from "@/components/organisms/BankPicker";
import { AuthLayout } from "@/components/templates/AuthLayout";
import { useConnectBank } from "@/features/auth/useConnectBank";
import { useSession } from "@/features/session/useSession";

/**
 * Bank selection screen. Redirects to the dashboard when a session exists.
 *
 * @returns The login page.
 */
export function LoginPage() {
  const { state, refresh } = useSession();
  const { connect, status, error } = useConnectBank();

  if (state.status === "connected") {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <AuthLayout>
      <div className="mb-8">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-ink/60">
          Step 01 / Bank
        </p>
        <h1 className="font-sans text-4xl font-black uppercase leading-none tracking-tighter sm:text-5xl">
          Pick your bank.
        </h1>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-ink/70">
          Choose where your money lives. You will approve read-only access on the bank's own site.
        </p>
      </div>

      {state.status === "loading" ? (
        <LoadingPanel label="Checking for an existing session..." />
      ) : state.status === "error" ? (
        <ErrorPanel message={state.message} onRetry={refresh} />
      ) : (
        <BankPicker onConnect={connect} redirecting={status === "redirecting"} error={error} />
      )}
    </AuthLayout>
  );
}
