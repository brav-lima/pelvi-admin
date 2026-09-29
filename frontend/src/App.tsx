import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AdminAuthProvider } from '@/contexts/AdminAuthContext'
import { ToastProvider } from '@/contexts/ToastContext'
import { Toaster } from '@/components/ui/toast'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { LoginPage } from '@/pages/Login'
import { DashboardPage } from '@/pages/Dashboard'
import { OrganizationsPage } from '@/pages/Organizations'
import { OrganizationDetailPage } from '@/pages/OrganizationDetail'
import { PlansPage } from '@/pages/Plans'
import { PlanFeaturesPage } from '@/pages/PlanFeatures'
import { SubscriptionsPage } from '@/pages/Subscriptions'
import { InvoicesPage } from '@/pages/Invoices'
import { SupportPage } from '@/pages/Support'
import { SupportDetailPage } from '@/pages/SupportDetail'

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
      <AdminAuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="organizations" element={<OrganizationsPage />} />
            <Route path="organizations/:id" element={<OrganizationDetailPage />} />
            <Route path="plans" element={<PlansPage />} />
            <Route path="plan-features" element={<PlanFeaturesPage />} />
            <Route path="subscriptions" element={<SubscriptionsPage />} />
            <Route path="invoices" element={<InvoicesPage />} />
            <Route path="support" element={<SupportPage />} />
            <Route path="support/:id" element={<SupportDetailPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AdminAuthProvider>
      <Toaster />
      </ToastProvider>
    </BrowserRouter>
  )
}
