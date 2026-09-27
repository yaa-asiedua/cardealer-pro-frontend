import { AuthProvider } from "../context/AuthContext";
import { BusinessSettingsProvider } from "../context/BusinessSettingsContext";
import { ThemeProvider } from "../context/ThemeContext";
import { ToastProvider } from "../context/ToastContext";
import { AppRoutes } from "./AppRoutes";

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BusinessSettingsProvider>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </BusinessSettingsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
