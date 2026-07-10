import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { DocumentProvider } from "@/context/DocumentContext";
import Dashboard from "./pages/Dashboard";
import QuoteForm from "./pages/QuoteForm";
import DocumentPreview from "./pages/DocumentPreview";
import Auth from "./pages/Auth";
import ProfileSettings from "./pages/ProfileSettings";
import Clients from "./pages/Clients";
import ClientDetail from "./pages/ClientDetail";
import Pipeline from "./pages/Pipeline";
import MoneyTracker from "./pages/MoneyTracker";
import NotFound from "./pages/NotFound";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useLocation } from "react-router-dom";
import { useEffect, useState } from "react";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = window.localStorage.getItem("sidebar:open");
    return stored === null ? true : stored === "true";
  });
  useEffect(() => {
    try {
      window.localStorage.setItem("sidebar:open", String(open));
    } catch {
      /* ignore */
    }
  }, [open]);
  if (!user || pathname === "/auth") return <>{children}</>;
  return (
    <SidebarProvider open={open} onOpenChange={setOpen}>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-3 border-b bg-card sticky top-0 z-40 px-3">
            <SidebarTrigger />
            <h1 className="text-lg sm:text-xl font-heading font-bold tracking-tight">HustleOS</h1>
          </header>
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

const AppRoutes = () => (
  <DocumentProvider>
    <AppShell>
     <Routes>
      <Route path="/auth" element={<Auth />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/create" element={<ProtectedRoute><QuoteForm /></ProtectedRoute>} />
      <Route path="/edit/:id" element={<ProtectedRoute><QuoteForm /></ProtectedRoute>} />
      <Route path="/preview/:id" element={<ProtectedRoute><DocumentPreview /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><ProfileSettings /></ProtectedRoute>} />
      <Route path="/clients" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
      <Route path="/clients/:id" element={<ProtectedRoute><ClientDetail /></ProtectedRoute>} />
      <Route path="/pipeline" element={<ProtectedRoute><Pipeline /></ProtectedRoute>} />
      <Route path="/money-tracker" element={<ProtectedRoute><MoneyTracker /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
     </Routes>
    </AppShell>
  </DocumentProvider>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
