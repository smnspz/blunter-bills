import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Button } from "@/components/atoms/Button";
import { Spinner } from "@/components/atoms/Spinner";
import { Notice } from "@/components/molecules/Notice";
import { AuthLayout } from "@/components/templates/AuthLayout";

/**
 * Enables the post-redirect screen and sends successful sessions to the dashboard.
 *
 * @returns The callback page.
 */
export function CallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const result = params.get("auth");
  const message = params.get("message");

  useEffect(() => {
    if (result !== "success") return;

    const timer = window.setTimeout(() => navigate("/setup/mail", { replace: true }), 700);
    return () => window.clearTimeout(timer);
  }, [navigate, result]);

  return (
    <AuthLayout>
      <div className="border-2 border-ink bg-paper p-6 shadow-brutal sm:p-8">
        {result === "success" ? (
          <div role="status" className="space-y-4">
            <div className="flex items-center gap-3">
              <Spinner />
              <p className="text-[11px] font-bold uppercase tracking-[0.18em]">Bank connected</p>
            </div>
            <h1 className="font-sans text-3xl font-black uppercase leading-none tracking-tighter sm:text-4xl">
              Taking you to mail setup.
            </h1>
            <p className="text-sm leading-relaxed text-ink/70">
              Bank connected. Next: connect your inbox so Blunter Bills can find new bills.
            </p>
          </div>
        ) : result === "error" ? (
          <div className="space-y-4">
            <Notice tone="error">{message ?? "The bank authorization failed."}</Notice>
            <h1 className="font-sans text-3xl font-black uppercase leading-none tracking-tighter sm:text-4xl">
              Connection failed.
            </h1>
            <Button onClick={() => navigate("/", { replace: true })}>Back to bank selection</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <h1 className="font-sans text-3xl font-black uppercase leading-none tracking-tighter sm:text-4xl">
              Nothing to confirm.
            </h1>
            <p className="text-sm leading-relaxed text-ink/70">
              Open the app and pick a bank to start.
            </p>
            <Button onClick={() => navigate("/", { replace: true })}>Back to bank selection</Button>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
