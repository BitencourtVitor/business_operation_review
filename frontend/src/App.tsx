import { useState } from 'react'
import { supabase } from './supabaseClient'
import type { User } from '@supabase/supabase-js'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import './App.css'

export default function App() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState<'login' | 'dashboard'>('login')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    setLoading(false)
    if (error) {
      setError(error.message)
      setUser(null)
    } else if (data.user) {
      setUser(data.user)
      setPage('dashboard')
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setPage('login')
  }

  return (
    <>
      {page === 'login' ? (
        <Login
          email={email}
          password={password}
          setEmail={setEmail}
          setPassword={setPassword}
          onLogin={handleLogin}
          error={error}
          loading={loading}
        />
      ) : (
        user && (
          <Dashboard
            onLogout={handleLogout}
            user={user}
          />
        )
      )}
    </>
  )
}
