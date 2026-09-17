import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { AuditPage } from "@/pages/AuditPage";
import { DailyPage } from "@/pages/DailyPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { DepartmentPage } from "@/pages/DepartmentPage";
import { LedgerPage } from "@/pages/LedgerPage";
import { LegalDocPage } from "@/pages/LegalDocPage";
import { LoginPage } from "@/pages/LoginPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { SummaryPage } from "@/pages/SummaryPage";
import { AuthProvider, useAuth } from "@/store/AuthStore";
import { ComplaintProvider } from "@/store/ComplaintStore";

function ProtectedApp() {
  const { user, authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="login-shell">
        <p className="login-loading">세션 확인 중…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/legal/:docId" element={<LegalDocPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <ComplaintProvider>
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/legal/:docId" element={<LegalDocPage />} />
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="ledger" element={<LedgerPage />} />
          <Route path="departments" element={<DepartmentPage />} />
          <Route path="summary" element={<SummaryPage />} />
          <Route path="daily" element={<DailyPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ComplaintProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ProtectedApp />
    </AuthProvider>
  );
}
