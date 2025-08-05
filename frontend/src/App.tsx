import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import InitialLoading from './pages/InitialLoading'
import ProtectedRoute from './components/common/ProtectedRoute'
import { DataCacheProvider } from './contexts/DataCacheContext'
import './App.css'

export default function App() {
  return (
    <DataCacheProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/initial-loading" element={<ProtectedRoute><InitialLoading /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/" element={<Navigate to="/initial-loading" replace />} />
        </Routes>
      </Router>
    </DataCacheProvider>
  )
}
