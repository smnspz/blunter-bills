import { Navigate, Route, Routes } from "react-router";
import { CallbackPage } from "@/pages/CallbackPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { LoginPage } from "@/pages/LoginPage";
import { MailSetupPage } from "@/pages/MailSetupPage";

/**
 * Client-side route table for the app.
 *
 * @returns The routed application shell.
 */
export function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/auth/callback" element={<CallbackPage />} />
      <Route path="/setup/mail" element={<MailSetupPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
