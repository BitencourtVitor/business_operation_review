import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import InitialLoading from './pages/InitialLoading'
import WorkforceForecast from './pages/WorkforceForecast'
import ProtectedRoute from './components/common/ProtectedRoute'
import { DataCacheProvider } from './contexts/DataCacheContext'
import { FuelDataProvider } from './contexts/FuelDataContext'
import './App.css'

export default function App() {
  return (
    <DataCacheProvider>
      <FuelDataProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/initial-loading" element={<ProtectedRoute><InitialLoading /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/forecast" element={<ProtectedRoute><WorkforceForecast telaId="" usuarioId="" role="" isResponsavelPelaTela={false} /></ProtectedRoute>} />
            <Route path="/" element={<Navigate to="/initial-loading" replace />} />
          </Routes>
        </Router>
      </FuelDataProvider>
    </DataCacheProvider>
  )
}
