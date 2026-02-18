import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Cookies from 'js-cookie';
import { supabase } from '../supabaseClient';
import { v4 as uuidv4 } from 'uuid';
import type { ForecastData } from '../types/dataControl';
import ProjectContainerModel from '../components/DataControl/ProjectContainerModel';
import DataControlFilters from '../components/DataControl/DataControlFilters';
import CategorizationManager from '../components/DataControl/CategorizationManager';
import MultiSelectDropdown from '../components/common/MultiSelectDropdown';

import logoWhite from '../assets/logo_white.png';
import logoBlack from '../assets/logo_black.png';
import type { Theme } from '../types/common';
import type { User } from '@supabase/supabase-js';

export default function DataControl() {
  const navigate = useNavigate();
  
  // Dashboard Layout State
  const [theme, setTheme] = useState<Theme>(Cookies.get('theme') === 'dark' ? 'dark' : 'light');
  const [user, setUser] = useState<User | null>(null);
  const [nomeCompleto, setNomeCompleto] = useState('');
  const [role, setRole] = useState('');

  // Global State
  const [pageState, setPageState] = useState<'menu' | 'create' | 'list' | 'details' | 'categorization'>('menu');
  // const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Projects State
  const [allProjects, setAllProjects] = useState<ForecastData[]>([]);
  
  // Filters
  const [filterClient, setFilterClient] = useState('');
  const [filterJobSite, setFilterJobSite] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [globalViewMode, setGlobalViewMode] = useState('Info & Dates');
  
  // Load User Data
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        
        setUser(user);

        const { data: usuario } = await supabase
          .from('usuarios')
          .select('id, nome_completo')
          .eq('email', user.email)
          .single();

        if (usuario) {
          setNomeCompleto(usuario.nome_completo);

          const { data: perfil } = await supabase
            .from('perfis')
            .select('tipo')
            .eq('usuario_id', usuario.id)
            .single();

          if (perfil) {
            setRole(perfil.tipo);
          }
        }
      } catch (error) {
        console.error('Erro ao buscar dados do usuário:', error);
      }
    };

    fetchUserData();
  }, []);

  // Persistir tema no cookie e aplicar classe
  useEffect(() => {
    Cookies.set('theme', theme, { expires: 365 });
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const handleThemeToggle = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    sessionStorage.clear();
    navigate('/login');
  };

  function renderRoleBadge() {
    let label = '';
    let style: React.CSSProperties = {
      borderRadius: 20,
      padding: '4px 14px',
      fontWeight: 600,
      fontSize: 12,
      marginLeft: 8,
      display: 'inline-block',
      border: '1px solid',
      background: 'var(--color-background-secondary)',
      color: 'var(--color-text-primary)',
      borderColor: 'var(--color-border-divider)',
      letterSpacing: 0.2,
    };
    let icon = null;
    
    if (role === 'dev') {
      label = 'Developer';
      const isDark = document.documentElement.classList.contains('dark');
      style = {
        ...style,
        borderColor: isDark ? '#BFA100' : '#FFD700',
        background: isDark ? 'rgba(255, 215, 0, 0.12)' : 'rgba(191, 161, 0, 0.12)',
        color: isDark ? '#BFA100' : '#FFD700',
      };
      icon = <i className="bi bi-gem" style={{ marginRight: 6, fontSize: 12, verticalAlign: 'middle' }} />;
    } else if (role === 'manager' || role === 'gestor') {
      label = 'Manager';
      style = {
        ...style,
        borderColor: 'var(--color-accent-primary)',
        background: 'rgba(46, 107, 230, 0.10)',
        color: 'var(--color-accent-primary)',
      };
      icon = <i className="bi bi-award" style={{ marginRight: 6, fontSize: 14, verticalAlign: 'middle' }} />;
    } else if (role === 'owner') {
      label = 'Owner';
      const isDark = document.documentElement.classList.contains('dark');
      style = {
        ...style,
        borderColor: isDark ? '#10B981' : '#059669',
        background: isDark ? 'rgba(16, 185, 129, 0.12)' : 'rgba(5, 150, 105, 0.12)',
        color: isDark ? '#10B981' : '#059669',
      };
      icon = <i className="bi bi-compass" style={{ marginRight: 6, fontSize: 14, verticalAlign: 'middle' }} />;
    } else if (role === 'user') {
      label = 'User';
      style = {
        ...style,
        borderColor: 'var(--color-border-divider)',
        background: 'var(--color-background-secondary)',
        color: 'var(--color-text-primary)',
      };
      icon = <i className="bi bi-person" style={{ marginRight: 6, fontSize: 14, verticalAlign: 'middle' }} />;
    } else if (role === 'admin_setor') {
      label = 'Admin';
    } else {
      label = role;
    }
    return <span style={style}>{icon}{label}</span>;
  }

  // Load Data
  const fetchProjects = async () => {
    // setLoading(true);
    const { data } = await supabase
      .from('forecast_data')
      .select('*')
      .order('cliente', { ascending: true })
      .order('job_site', { ascending: true });
    
    if (data) setAllProjects(data);
    // setLoading(false);
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  // Derived State
  const clients = Array.from(new Set(allProjects.map(p => p.cliente))).sort();
  const uniqueJobSites = Array.from(new Set(allProjects.map(p => p.job_site))).sort();
  const uniqueTypes = Array.from(new Set(allProjects.map(p => p.type).filter(Boolean))).sort();
  
  const availableJobSites = Array.from(new Set(allProjects
    .filter(p => p.cliente === filterClient)
    .map(p => p.job_site)))
    .sort();

  const filteredProjects = allProjects.filter(p => 
    (!filterClient || p.cliente === filterClient) && 
    (!filterJobSite || p.job_site === filterJobSite) &&
    (!filterStatus || p.status === filterStatus)
  );

  // Handlers
  const handleCreateProject = async (data: Partial<ForecastData>) => {
    // setLoading(true);
    const newId = uuidv4().substring(0, 8); // Generate short ID like example
    
    // Sanitize date fields: convert empty strings to null
    const sanitizedData = { ...data };
    if (sanitizedData.previous_beams_date === '') sanitizedData.previous_beams_date = null;
    if (sanitizedData.previous_start_date === '') sanitizedData.previous_start_date = null;
    if (sanitizedData.previous_end_date === '') sanitizedData.previous_end_date = null;

    const projectData = {
      ...sanitizedData,
      id: newId,
      create_datetime: new Date().toISOString(),
      lastupdate_datetimez: new Date().toISOString()
    };

    const { error } = await supabase.from('forecast_data').insert([projectData]);

    if (error) {
      console.error('Error creating project:', error);
      setMessage({ type: 'error', text: 'Error creating project: ' + error.message });
      // setLoading(false);
      throw error;
    } else {
      // Auto-populate Fieldwire and Machines based on Client/Type
      try {
        const client = projectData.cliente;
        const type = projectData.type;

        // 1. Fieldwire Logic
        let fwCategory = '';
        if (client === 'Callahan') fwCategory = 'Callahan';
        else if (client === 'Private') fwCategory = 'Private';
        else if (client === 'Toll Brothers') fwCategory = 'Toll Brothers';
        else if (client === 'Pulte Homes') {
            if (type === 'Building') fwCategory = 'Pulte Homes - Building';
            else if (type === 'Lot') fwCategory = 'Pulte Homes - House';
        }

        if (fwCategory) {
            const { data: fwTemplates } = await supabase
                .from('C_fieldwire')
                .select('*')
                .eq('category', fwCategory);

            if (fwTemplates && fwTemplates.length > 0) {
                const newItems = fwTemplates.map(t => ({
                    obra_id: newId,
                    category: t.category,
                    document: t.document,
                    status: false,
                    lastupdate_datetimez: new Date().toISOString()
                }));
                await supabase.from('forecast_fieldwire').insert(newItems);
            }
        }

        // 2. Machines Logic
        // Load by Client = Category, and filter by Type = Subcategory (with House/Lot equivalence)
        if (client) {
             const { data: machTemplates } = await supabase
                .from('C_machines')
                .select('*')
                .eq('category', client);

             if (machTemplates && machTemplates.length > 0) {
                 const machItems = machTemplates.filter(t => {
                     if (!type) return false;
                     
                     // Direct match
                     if (t.subcategory === type) return true;
                     
                     // Equivalence House/Lot
                     if (type === 'Lot' && t.subcategory === 'House') return true;
                     if (type === 'House' && t.subcategory === 'Lot') return true;
                     
                     return false;
                 }).map(t => ({
                       obra_id: newId,
                       category: t.category,
                       subcategory: t.subcategory,
                       equipment_category: t.equipment_category,
                       title: t.title,
                       status: false,
                       unit: '',
                       lastupdate_datetimez: new Date().toISOString()
                  }));

                 if (machItems.length > 0) {
                     await supabase.from('forecast_machines').insert(machItems);
                 }
             }
        }

      } catch (err) {
          console.error('Error auto-populating fieldwire/machines:', err);
      }

      // setMessage({ type: 'success', text: 'Project created successfully!' }); // Removido alerta global
      fetchProjects();
      // Não redirecionar mais
      // setPageState('list');
    }
    // setLoading(false);
  };

  /*
  const handleUpdateProject = async (id: string, data: Partial<ForecastData>) => {
    const project = allProjects.find(p => p.id === id);
    if (!project) return;
    setLoading(true);

    // Check for status change and log performance
    if (data.status && data.status !== project.status) {
      const { data: { user } } = await supabase.auth.getUser();
      const event = `${project.status} -> ${data.status}`;
      const dateType = data.status === 'closed' ? 'End' : 'Start';
      
      // Fetch workforce from Contract Steps if possible
      const { data: contracts } = await supabase
        .from('forecast_contract_steps')
        .select('team')
        .eq('obra_id', id)
        .neq('team', null)
        .limit(1);
        
      const subcontractor = contracts && contracts.length > 0 ? contracts[0].team : null;

      const { error: perfError } = await supabase.from('subcontractor_performance').insert([{
        obra_id: id,
        event: event,
        estimated_date_type: dateType,
        subcontractor: subcontractor,
        event_datetime: new Date().toISOString(),
        user_email: user?.email || 'unknown'
      }]);
      
      if (perfError) console.error('Error logging performance:', perfError);
    }

    const { error } = await supabase
      .from('forecast_data')
      .update({
        ...data,
        lastupdate_datetimez: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      console.error('Error updating project:', error);
      setMessage({ type: 'error', text: 'Error updating project: ' + error.message });
    } else {
      setMessage({ type: 'success', text: 'Project updated successfully!' });
      fetchProjects();
    }
    setLoading(false);
  };

  const handleDeleteProject = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this project?')) return;

    setLoading(true);
    const { error } = await supabase.from('forecast_data').delete().eq('id', id);
    
    if (error) {
      console.error('Error deleting project:', error);
      setMessage({ type: 'error', text: 'Error deleting project: ' + error.message });
    } else {
      setMessage({ type: 'success', text: 'Project deleted successfully!' });
      fetchProjects();
    }
    setLoading(false);
  };
  */

  // Render Helpers
  const renderMenu = () => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '32px', position: 'relative' }}>
      <h1 style={{ marginBottom: '32px', color: 'var(--color-text-primary)' }}>Data Control</h1>
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <div 
          onClick={() => setPageState('create')}
          style={{ 
            width: '250px', 
            height: '200px', 
            backgroundColor: 'var(--color-background-primary)', 
            border: '1px solid var(--color-border-divider)', 
            borderRadius: '12px', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center', 
            cursor: 'pointer',
            boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
            transition: 'transform 0.2s'
          }}
          className="hover-card"
        >
          <i className="bi bi-plus-circle" style={{ fontSize: '48px', color: 'var(--color-accent-primary)', marginBottom: '16px' }}></i>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)' }}>New Project</h3>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>Create a new forecast project</p>
        </div>

        <div 
          onClick={() => { setFilterClient(''); setFilterJobSite(''); setPageState('list'); }}
          style={{ 
            width: '250px', 
            height: '200px', 
            backgroundColor: 'var(--color-background-primary)', 
            border: '1px solid var(--color-border-divider)', 
            borderRadius: '12px', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center', 
            cursor: 'pointer',
            boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
            transition: 'transform 0.2s'
          }}
          className="hover-card"
        >
          <i className="bi bi-list-ul" style={{ fontSize: '48px', color: 'var(--color-accent-primary)', marginBottom: '16px' }}></i>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Edit Existing Project</h3>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>Browse and manage projects</p>
        </div>

        <div 
          onClick={() => setPageState('categorization')}
          style={{ 
            width: '250px', 
            height: '200px', 
            backgroundColor: 'var(--color-background-primary)', 
            border: '1px solid var(--color-border-divider)', 
            borderRadius: '12px', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center', 
            cursor: 'pointer',
            boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
            transition: 'transform 0.2s'
          }}
          className="hover-card"
        >
          <i className="bi bi-gear" style={{ fontSize: '48px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}></i>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Manage Options</h3>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>Configure categorization settings</p>
        </div>
      </div>
    </div>
  );

  const renderCreate = () => (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="d-flex flex-row align-items-center" style={{ padding: '10px 20px', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
        <h1 style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0 }}>Create New Project</h1>
      </div>
      <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ maxWidth: '1000px', width: '100%' }}>
            <ProjectContainerModel 
                isCreationMode={true}
                onCreate={handleCreateProject}
                availableTypes={uniqueTypes as string[]}
                availableJobSites={uniqueJobSites as string[]}
                availableClients={clients as string[]}
                project={{} as any}
                status="not started"
                theme={theme}
            />
        </div>
      </div>
    </div>
  );

  const renderList = () => {
    return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="d-flex flex-row justify-content-between align-items-center" style={{ padding: '10px 20px', borderBottom: '1px solid var(--color-border-divider)', background: 'var(--color-background-primary)' }}>
        <h1 style={{ color: 'var(--color-text-primary)', fontSize: 24, fontWeight: 400, flex: '0 0 auto', marginBottom: 0 }}>Projects List</h1>
        <DataControlFilters 
          viewMode={globalViewMode} 
          setViewMode={setGlobalViewMode} 
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          theme={theme}
        />
      </div>

      <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        {filteredProjects.map((project) => (
          <ProjectContainerModel
            key={project.id}
            status={project.status as any || 'open'}
            project={project}
            onUpdate={fetchProjects}
            availableTypes={uniqueTypes as string[]}
            availableJobSites={uniqueJobSites as string[]}
            availableClients={clients as string[]}
            forcedTab={globalViewMode}
            theme={theme}
          />
        ))}
        
        {filteredProjects.length === 0 && (
           <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-secondary)' }}>
              No projects found matching your criteria.
           </div>
        )}
      </div>
    </div>
  );
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, var(--color-background-secondary) 0%, var(--color-background-primary) 100%)',
      width: '100%',
      maxWidth: '100vw',
      overflowX: 'hidden',
      position: 'relative'
    }}>
      {/* Header */}
      <header
        style={{
          width: '100%',
          height: 64,
          background: 'var(--color-background-primary)',
          borderBottom: '1.5px solid var(--color-border-divider)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px 0 0',
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: 1000,
          boxSizing: 'border-box'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, width: 215, minWidth: 215, height: '100%', justifyContent: 'center', borderRight: '1.5px solid var(--color-border-divider)'}}>
          <img
            src={theme === 'dark' ? logoWhite : logoBlack}
            alt="Logo"
            style={{
              width: '75%',
              height: 'auto',
              objectFit: 'contain',
              background: 'transparent',
              display: 'block',
            }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span className="fw-light" style={{ color: 'var(--color-accent-primary)', fontWeight: 400, fontSize: 22, letterSpacing: 0.5 }}>
            Data Control
          </span>
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: 10 }}>
            Manage your forecast projects and data.
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: 16 }}>
            {nomeCompleto || user?.email}
          </span>
          {renderRoleBadge()}
          <button
            type="button"
            onClick={handleThemeToggle}
            className="btn-secondary-custom d-flex align-items-center justify-content-center"
            style={{ width: 42, height: 38, fontSize: 16, marginBottom: 0, marginTop: 0 }}
          >
            <i className={`bi ${theme === 'dark' ? 'bi-moon-stars' : 'bi-sun'}`}/>
          </button>
          <button
            onClick={handleLogout}
            className="btn-secondary-custom d-flex align-items-center justify-content-center"
            style={{ width: 42, height: 38, fontSize: 16, marginLeft: 4 }}
            title="Sair"
          >
            <i className="bi bi-door-open" />
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        id="sidebar"
        style={{
          position: 'fixed',
          top: 64,
          left: 0,
          width: 215,
          minWidth: 215,
          maxWidth: 215,
          height: 'calc(100vh - 64px)',
          background: 'var(--color-background-primary)',
          borderRight: '1.5px solid var(--color-border-divider)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1,
        }}
      >
        <div style={{ 
          width: '100%', 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          borderBottom: '1px solid var(--color-border-divider)',
          flex: 1,
          overflowY: 'hidden'
        }}>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 10px 0'}}>
            {/* Back to Dashboard */}
            <button
              className="btn-sidebar d-flex align-items-center justify-content-start w-100 mb-2"
              style={{ gap: 10, padding: '8px 12px', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}
              onClick={() => navigate('/dashboard')}
            >
              <i className="bi bi-grid" style={{ fontSize: 14 }} />
              Dashboard
            </button>

            <div style={{ width: '100%', height: '1px', backgroundColor: 'var(--color-border-divider)', margin: '8px 0' }}></div>

            {/* Menu (Home) */}
            <button
              className={`btn-sidebar d-flex align-items-center justify-content-start w-100 mb-2 ${pageState === 'menu' ? 'btn-sidebar-ativo' : ''}`}
              style={{ gap: 10, padding: '8px 12px', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}
              onClick={() => setPageState('menu')}
            >
              <i className="bi bi-house" style={{ fontSize: 14 }} />
              Home
            </button>

            {/* Create Project */}
            <button
              className={`btn-sidebar d-flex align-items-center justify-content-start w-100 mb-2 ${pageState === 'create' ? 'btn-sidebar-ativo' : ''}`}
              style={{ gap: 10, padding: '8px 12px', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}
              onClick={() => setPageState('create')}
            >
              <i className="bi bi-plus-circle" style={{ fontSize: 14 }} />
              New Project
            </button>

            {/* List Projects */}
            <button
              className={`btn-sidebar d-flex align-items-center justify-content-start w-100 mb-2 ${pageState === 'list' ? 'btn-sidebar-ativo' : ''}`}
              style={{ gap: 10, padding: '8px 12px', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}
              onClick={() => { setFilterClient(''); setFilterJobSite(''); setPageState('list'); }}
            >
              <i className="bi bi-list-ul" style={{ fontSize: 14 }} />
              Projects List
            </button>

            {/* Categorization */}
            <button
              className={`btn-sidebar d-flex align-items-center justify-content-start w-100 mb-2 ${pageState === 'categorization' ? 'btn-sidebar-ativo' : ''}`}
              style={{ gap: 10, padding: '8px 12px', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}
              onClick={() => setPageState('categorization')}
            >
              <i className="bi bi-gear" style={{ fontSize: 14 }} />
              Categorization
            </button>

            <div style={{ width: '100%', height: '1px', backgroundColor: 'var(--color-border-divider)', margin: '16px 0 8px 0' }}></div>
            
            {/* Filters */}
            <div style={{ width: '100%', padding: '0 12px' }}>
              <small style={{ display: 'block', color: 'var(--color-text-secondary)', marginBottom: '8px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>Filter Client</small>
              <div style={{ marginBottom: '16px' }}>
                <MultiSelectDropdown
                  options={clients}
                  selectedValues={filterClient ? [filterClient] : []}
                  onChange={(vals) => {
                    setFilterClient(vals[0] || '');
                    setFilterJobSite('');
                  }}
                  placeholder="Select Client"
                  allLabel="All Clients"
                  isSingleSelect={true}
                  variant="default"
                  style={{
                    border: '1px solid var(--color-border-divider)',
                    borderRadius: '4px',
                    fontSize: '12px',
                    backgroundColor: 'var(--color-background-primary)',
                    color: 'var(--color-text-primary)',
                    fontWeight: 400
                  }}
                />
              </div>

              <small style={{ display: 'block', color: 'var(--color-text-secondary)', marginBottom: '8px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>Filter Job Site</small>
              <div style={{ marginBottom: '16px' }}>
                <MultiSelectDropdown
                  options={availableJobSites}
                  selectedValues={filterJobSite ? [filterJobSite] : []}
                  onChange={(vals) => setFilterJobSite(vals[0] || '')}
                  placeholder="Select Job Site"
                  allLabel="All Job Sites"
                  isSingleSelect={true}
                  variant="default"
                  style={{
                    border: '1px solid var(--color-border-divider)',
                    borderRadius: '4px',
                    fontSize: '12px',
                    backgroundColor: 'var(--color-background-primary)',
                    color: 'var(--color-text-primary)',
                    fontWeight: 400
                  }}
                  // disabled={!filterClient} // MultiSelectDropdown doesn't support disabled prop yet, but logic handles empty options if needed
                />
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main
        style={{
          position: 'fixed',
          top: 64,
          left: 215,
          width: 'calc(100vw - 215px)',
          height: 'calc(100vh - 64px)',
          overflow: 'hidden',
          background: 'transparent',
          zIndex: 10,
        }}
      >
        <div style={{ height: '100%', backgroundColor: 'var(--color-background-secondary)' }}>
          {message && (
            <div 
              className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-danger'} shadow-sm`} 
              style={{ 
                position: 'fixed', 
                top: 80, 
                right: 20, 
                zIndex: 2000, 
                minWidth: 300,
                maxWidth: 400,
                // Ensure colors are readable regardless of theme
                color: message.type === 'success' ? '#0f5132' : '#842029',
                backgroundColor: message.type === 'success' ? '#d1e7dd' : '#f8d7da',
                borderColor: message.type === 'success' ? '#badbcc' : '#f5c6cb',
                paddingRight: '3rem'
              }} 
              role="alert"
            >
              {message.text}
              <button 
                type="button" 
                className="btn-close position-absolute" 
                style={{ top: '1rem', right: '1rem' }}
                onClick={() => setMessage(null)}
              ></button>
            </div>
          )}

          {pageState === 'menu' && renderMenu()}
          {pageState === 'create' && renderCreate()}
          {pageState === 'list' && renderList()}
          {pageState === 'categorization' && <CategorizationManager />}
        </div>
      </main>
    </div>
  );
}
