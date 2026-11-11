import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Button } from "@/components/atoms/Button";
import { ErrorPanel } from "@/components/molecules/ErrorPanel";
import { LoadingPanel } from "@/components/molecules/LoadingPanel";
import { Notice } from "@/components/molecules/Notice";
import { MailSetupPanel } from "@/components/organisms/MailSetupPanel";
import { AuthLayout } from "@/components/templates/AuthLayout";
import { useConnectMail } from "@/features/mail/useConnectMail";
import { useMailStatus } from "@/features/mail/useMailStatus";
import { mailErrorMessage } from "@/lib/mail-errors";

/**
 * Second setup step: explains email access and connects a mail provider.
 *
 * @returns The mail setup page.
 */
export function MailSetupPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const result = params.get("mail");
  const message = params.get("message");
  const { state, refresh } = useMailStatus();
  const { connectGmail, status, error } = useConnectMail();
  const mail = state.status === "ready" ? state.mail : null;
  const connected = mail?.connected === true;
  const displayMessage = mailErrorMessage(message);

  useEffect(() => {
    if (mail === null || !mail.connected || result !== "success") return;

    const timer = window.setTimeout(() => navigate("/dashboard", { replace: true }), 1400);
    return () => window.clearTimeout(timer);
  }, [mail, navigate, result]);

  return (
    <AuthLayout>
      <div className="mb-8">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-ink/60">
          Step 02 / Mail
        </p>
        <h1 className="font-sans text-4xl font-black uppercase leading-none tracking-tighter sm:text-5xl">
          {connected ? "Inbox connected." : "Connect your inbox."}
        </h1>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-ink/70">
          {connected
            ? "Blunter Bills can now look for new bills in your inbox."
            : "One more step before the dashboard: let Blunter Bills look for new bills in your email."}
        </p>
      </div>

      {state.status === "loading" ? (
        <LoadingPanel label="Checking mail connection..." />
      ) : state.status === "error" ? (
        <ErrorPanel message={state.message} onRetry={refresh} />
      ) : connected ? (
        <div className="space-y-4">
          <Notice tone="info">
            {result === "success"
              ? "Gmail connected. Taking you to the dashboard..."
              : "Gmail is already connected."}
          </Notice>
          <Button onClick={() => navigate("/dashboard", { replace: true })}>Go to dashboard</Button>
        </div>
      ) : (
        <>
          {result === "error" ? (
            <div className="mb-4">
              <Notice tone="error">{displayMessage ?? "Gmail connection failed."}</Notice>
            </div>
          ) : null}
          <MailSetupPanel
            configured={mail?.configured ?? false}
            redirecting={status === "redirecting"}
            error={error}
            onConnect={connectGmail}
          />
        </>
      )}
    </AuthLayout>
  );
}
