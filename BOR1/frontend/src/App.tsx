import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Maintenance from './pages/Maintenance'
import NewExperience from './pages/NewExperience'
import OldAccess from './pages/OldAccess'
import Dashboard from './pages/Dashboard'
import InitialLoading from './pages/InitialLoading'
import WorkforceForecast from './pages/WorkforceForecast'
import MobileForecast from './pages/MobileForecast'
import OperationalForecastIndex from './pages/OperationalForecastIndex'
import DataControl from './pages/DataControl'
import AutoLog from './pages/AutoLog'
import WexCategorization from './pages/WexCategorization'
import WeeklyHoursControl from './pages/WeeklyHoursControl'
import ProtectedRoute, { MAINTENANCE_MODE, NEW_EXPERIENCE_MODE } from './components/common/ProtectedRoute'
import { DataCacheProvider } from './contexts/DataCacheContext'
import { GlobalFeedbackProvider } from './contexts/GlobalFeedbackContext'
import './App.css'

export default function App() {
  return (
    <DataCacheProvider>
      <GlobalFeedbackProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/old" element={<OldAccess />} />
            <Route path="/maintenance" element={<Maintenance />} />
            <Route path="/new-experience" element={<NewExperience />} />
            <Route path="/initial-loading" element={<ProtectedRoute><InitialLoading /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/forecast" element={
              MAINTENANCE_MODE ? <Navigate to="/maintenance" replace /> :
              NEW_EXPERIENCE_MODE ? <Navigate to="/new-experience" replace /> :
              <MobileForecast />
            } />
            <Route path="/workforce-forecast" element={<ProtectedRoute><WorkforceForecast telaId="" usuarioId="" role="" isResponsavelPelaTela={false} /></ProtectedRoute>} />
            <Route path="/data-control" element={<ProtectedRoute><DataControl /></ProtectedRoute>} />
            <Route path="/ofi" element={<ProtectedRoute><OperationalForecastIndex /></ProtectedRoute>} />
            <Route path="/auto-log" element={<ProtectedRoute><AutoLog /></ProtectedRoute>} />
            <Route path="/wex-categorization" element={<ProtectedRoute><WexCategorization /></ProtectedRoute>} />
            <Route path="/weekly-hours-control" element={<ProtectedRoute><WeeklyHoursControl /></ProtectedRoute>} />
            <Route path="/" element={<Navigate to="/initial-loading" replace />} />
          </Routes>
        </Router>
      </GlobalFeedbackProvider>
    </DataCacheProvider>
  )
}
