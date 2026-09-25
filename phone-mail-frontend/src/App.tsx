import { Navigate, Route, Routes } from 'react-router-dom';
import './App.css';
import { AuthProvider } from './context/AuthProvider';
import { SocketProvider } from './context/SocketProvider';
import { useAuth } from './hooks/useAuth';
import { LoadingSpinner } from './components/common/LoadingSpinner';
import AuthLayout from './layouts/AuthLayout';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import VerifyOTP from './pages/VerifyOTP';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Profile from './pages/Profile';

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { user, initializing } = useAuth();
  if (initializing) {
    return (
      <div className="grid h-dvh place-items-center bg-[#eaf1fb]">
        <LoadingSpinner size="lg" className="text-[#1a66ff]" />
      </div>
    );
  }
  return user ? children : <Navigate to="/login" replace />;
}

function RedirectIfAuthed({ children }: { children: React.ReactElement }) {
  const { user, initializing } = useAuth();
  if (initializing) return null;
  return user ? <Navigate to="/" replace /> : children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        element={
          <RedirectIfAuthed>
            <AuthLayout />
          </RedirectIfAuthed>
        }
      >
        <Route path="/login" element={<Login />} />
        <Route path="/verify-otp" element={<VerifyOTP />} />
      </Route>

      <Route
        element={
          <RequireAuth>
            <MainLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/drafts" element={<Dashboard />} />
        <Route path="/spam" element={<Dashboard />} />
        <Route path="/trash" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/profile" element={<Profile />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <AppRoutes />
      </SocketProvider>
    </AuthProvider>
  );
}
