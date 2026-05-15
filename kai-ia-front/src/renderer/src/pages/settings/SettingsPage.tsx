import React, { useEffect, useMemo, useState } from 'react'
import {
  Menu,
  Settings,
  Save,
  RefreshCw,
  Bot,
  Mail,
  FolderOpen,
  KeyRound,
  ShieldCheck,
  Search,
  UserRound,
  Link2,
  Wrench
} from 'lucide-react'
import {
  type BackendSettings,
  getBackendSettings,
  getLocalSettings,
  regenerateUserProfile,
  saveBackendSettings,
  saveLocalSettings
} from '../../services/settings.service'

type SettingsSectionId = 'general' | 'profile' | 'model' | 'tools' | 'google' | 'gmail' | 'prompts'

type SettingsForm = {
  server_url: string
  server_port: string
  user_profile_raw: string
  user_profile_json: string
} & BackendSettings

type SectionItem = {
  id: SettingsSectionId
  label: string
  description: string
  icon: React.ReactNode
}

const SECTION_ITEMS: SectionItem[] = [
  {
    id: 'general',
    label: 'General',
    description: 'URL, puerto y parámetros globales',
    icon: <Link2 size={16} />
  },
  {
    id: 'profile',
    label: 'Perfil',
    description: 'Texto base y JSON del usuario',
    icon: <UserRound size={16} />
  },
  {
    id: 'model',
    label: 'Modelo',
    description: 'LLM, temperatura y system prompt',
    icon: <Bot size={16} />
  },
  {
    id: 'google',
    label: 'Google',
    description: 'OAuth, credenciales, token y scopes',
    icon: <ShieldCheck size={16} />
  },
  {
    id: 'gmail',
    label: 'Gmail',
    description: 'Límites del servicio de correo',
    icon: <Mail size={16} />
  },
  {
    id: 'prompts',
    label: 'Prompts',
    description: 'Prompts internos del sistema',
    icon: <KeyRound size={16} />
  },
  {
    id: 'tools',
    label: 'Tools',
    description: 'Activación automática de herramientas',
    icon: <Wrench size={16} />
  }
]

const EMPTY_FORM: SettingsForm = {
  server_url: 'http://localhost',
  server_port: '8000',
  user_profile_raw: '',
  user_profile_json: '{}',
  google_redirect_uri: 'http://localhost:8000/auth/google/callback',
  google_scopes: '[]',
  google_credentials_file: '',
  google_token_file: '',
  email_max_total_size_attachment: '18874368',
  system_prompt_default: '',
  model_name: '',
  temperature: '0',
  llm_context_length: '8192',
  tool_activation_keywords: '[]',
  'default_prompts.resume_mail': '',
  'default_prompts.basic_user_information_json': '',
  'default_prompts.chat_summary': ''
}

/**
 * Render a compact label block for a settings field.
 *
 * Args:
 *   title: Main label text.
 *   subtitle: Optional helper text shown below the label.
 *
 * Returns:
 *   React.JSX.Element
 */
function FieldLabel({ title, subtitle }: { title: string; subtitle?: string }): React.JSX.Element {

  return (
    <div className="mb-2">
      <label className="text-sm font-medium text-white">{title}</label>
      {subtitle ? <p className="mt-1 text-xs text-slate-400">{subtitle}</p> : null}
    </div>
  )
}

function TextInput({
  value,
  onChange,
  placeholder
}: {
  value: string
  /**
   * Render a styled single-line settings input.
   *
   * Args:
   *   value: Current input value.
   *   onChange: Receives the next text value.
   *   placeholder: Empty-state text for the field.
   *
   * Returns:
   *   React.JSX.Element
   */
  onChange: (value: string) => void
  placeholder?: string
}): React.JSX.Element {

  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/30 focus:bg-black/25"
    />
  )
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 5
}: {
  value: string
  /**
   * Render a styled multi-line settings input.
   *
   * Args:
   *   value: Current text area value.
   *   onChange: Receives the next text value.
   *   placeholder: Empty-state text for the field.
   *   rows: Visible row count for the text area.
   *
   * Returns:
   *   React.JSX.Element
   */
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}): React.JSX.Element {

  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full resize-none rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/30 focus:bg-black/25"
    />
  )
}

/**
 * Render one settings section with its title, description and controls.
 *
 * Args:
 *   title: Section heading.
 *   description: Short explanation for the section.
 *   children: Section controls and content.
 *
 * Returns:
 *   React.JSX.Element
 */
function SectionCard({
  title,
  description,
  children
}: {
  title: string
  description: string
  children: React.ReactNode
}): React.JSX.Element {

  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.28)] backdrop-blur-2xl">
      <div className="mb-5">
        <h3 className="text-base font-semibold text-white">{title}</h3>
        <p className="mt-1 text-sm text-slate-400">{description}</p>
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  )
}

/**
 * Render the configuration page and coordinate loading, editing and saving settings.
 *
 * Args:
 *   None.
 *
 * Returns:
 *   React.JSX.Element
 */
const SettingsPage = (): React.JSX.Element => {

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('general')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<SettingsForm>(EMPTY_FORM)
  const [initialForm, setInitialForm] = useState<SettingsForm>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [regeneratingProfile, setRegeneratingProfile] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const hasChanges = useMemo(() => {
    return JSON.stringify(form) !== JSON.stringify(initialForm)
  }, [form, initialForm])

  const filteredSections = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return SECTION_ITEMS

    return SECTION_ITEMS.filter(
      (section) =>
        section.label.toLowerCase().includes(term) ||
        section.description.toLowerCase().includes(term)
    )
  }, [search])

  /**
   * Update one field in the editable settings draft.
   *
   * Args:
   *   key: Settings key to update.
   *   value: New value stored for the key.
   *
   * Returns:
   *   void
   */
  const updateField = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) => {

    setForm((prev) => ({
      ...prev,
      [key]: value
    }))
  }

  /**
   * Load every persisted setting required by the settings page.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   Promise<void>
   */
  const loadAllSettings = async () => {

    setLoading(true)
    setErrorMessage('')
    setSaveMessage('')

    try {
      const local = await getLocalSettings()
      const backend = await getBackendSettings({
        serverUrl: local.server_url,
        serverPort: local.server_port
      })

      const nextForm: SettingsForm = {
        ...local,
        ...backend
      }

      setForm(nextForm)
      setInitialForm(nextForm)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo cargar la configuración')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAllSettings()
  }, [])

  /**
   * Reset persisted settings and refresh the editable draft.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   Promise<void>
   */
  const handleReset = () => {

    setForm(initialForm)
    setSaveMessage('Cambios visuales descartados.')
    setErrorMessage('')
  }

  /**
   * Reload settings from disk without saving current edits.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   Promise<void>
   */
  const handleReload = async () => {

    await loadAllSettings()
  }

  /**
   * Ask the backend to rebuild the structured profile from the raw profile text.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   Promise<void>
   */
  const handleRegenerateProfile = async () => {

    setErrorMessage('')
    setSaveMessage('')

    if (!form.user_profile_raw.trim()) {
      setErrorMessage('Introduce primero un texto base del usuario para regenerar el perfil.')
      return
    }

    try {
      setRegeneratingProfile(true)

      const profile = await regenerateUserProfile(form.user_profile_raw, {
        serverUrl: form.server_url,
        serverPort: form.server_port
      })

      updateField('user_profile_json', JSON.stringify(profile, null, 2))
      setSaveMessage('User profile regenerado correctamente. Guarda para persistirlo.')
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'No se pudo regenerar el user profile'
      )
    } finally {
      setRegeneratingProfile(false)
    }
  }

  /**
   * Persist the edited settings and refresh the profile context when needed.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   Promise<void>
   */
  const handleSave = async () => {

    setErrorMessage('')
    setSaveMessage('')

    try {
      const parsedPort = Number(form.server_port)
      if (!form.server_url.trim()) {
        throw new Error('La URL del backend no puede estar vacía')
      }
      if (!Number.isFinite(parsedPort)) {
        throw new Error('El puerto del backend no es válido')
      }

      let parsedUserProfile: Record<string, unknown> = {}
      try {
        const parsed = JSON.parse(form.user_profile_json || '{}')
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          throw new Error()
        }
        parsedUserProfile = parsed as Record<string, unknown>
      } catch {
        throw new Error('El user profile JSON no es válido')
      }
      const parsedContextLength = Number(form.llm_context_length)

      if (!Number.isFinite(parsedContextLength) || parsedContextLength < 1024) {
        throw new Error('El context length debe ser un número válido mayor o igual que 1024')
      }

      try {
        const parsedKeywords = JSON.parse(form.tool_activation_keywords || '[]')

        if (!Array.isArray(parsedKeywords)) {
          throw new Error()
        }

        for (const keyword of parsedKeywords) {
          if (typeof keyword !== 'string') {
            throw new Error()
          }
        }
      } catch {
        throw new Error(
          'Las palabras clave de tools deben ser un JSON válido con una lista de strings'
        )
      }

      const backendPayload: BackendSettings = {
        google_redirect_uri: form.google_redirect_uri,
        google_scopes: form.google_scopes,
        google_credentials_file: form.google_credentials_file,
        google_token_file: form.google_token_file,
        email_max_total_size_attachment: form.email_max_total_size_attachment,
        system_prompt_default: form.system_prompt_default,
        model_name: form.model_name,
        temperature: form.temperature,
        llm_context_length: form.llm_context_length,
        tool_activation_keywords: form.tool_activation_keywords,
        'default_prompts.resume_mail': form['default_prompts.resume_mail'],
        'default_prompts.basic_user_information_json':
          form['default_prompts.basic_user_information_json'],
        'default_prompts.chat_summary': form['default_prompts.chat_summary']
      }

      setSaving(true)

      const savedBackend = await saveBackendSettings(backendPayload, {
        serverUrl: form.server_url,
        serverPort: form.server_port
      })

      await saveLocalSettings({
        server_url: form.server_url,
        server_port: form.server_port,
        user_profile_raw: form.user_profile_raw,
        user_profile_json: parsedUserProfile
      })

      const nextForm: SettingsForm = {
        server_url: form.server_url,
        server_port: form.server_port,
        user_profile_raw: form.user_profile_raw,
        user_profile_json: JSON.stringify(parsedUserProfile, null, 2),
        ...savedBackend
      }

      setForm(nextForm)
      setInitialForm(nextForm)
      setSaveMessage('Configuración guardada correctamente.')
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'No se pudo guardar la configuración'
      )
    } finally {
      setSaving(false)
    }
  }

  /**
   * Render the controls for the currently selected settings section.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   React.ReactNode
   */
  const renderSectionContent = () => {

    switch (activeSection) {
      case 'general':
        return (
          <SectionCard
            title="Configuración general"
            description="URL y puerto del backend que utilizará la aplicación."
          >
            <div>
              <FieldLabel title="URL del backend" subtitle="Ejemplo: http://localhost" />
              <TextInput
                value={form.server_url}
                onChange={(value) => updateField('server_url', value)}
                placeholder="http://localhost"
              />
            </div>

            <div>
              <FieldLabel title="Puerto del backend" subtitle="Ejemplo: 8000" />
              <TextInput
                value={form.server_port}
                onChange={(value) => updateField('server_port', value)}
                placeholder="8000"
              />
            </div>
          </SectionCard>
        )

      case 'profile':
        return (
          <SectionCard
            title="Perfil del usuario"
            description="Texto base y JSON local del usuario. Este bloque vive en Electron, no en el backend."
          >
            <div>
              <FieldLabel
                title="Texto base del usuario"
                subtitle="Se usará para regenerar el user profile cuando lo necesites."
              />
              <TextArea
                value={form.user_profile_raw}
                onChange={(value) => updateField('user_profile_raw', value)}
                rows={10}
                placeholder="Me llamo Enrique, prefiero que me llamen Kike, estudio Ingeniería Informática..."
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleRegenerateProfile}
                disabled={regeneratingProfile || saving}
                className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                {regeneratingProfile ? 'Regenerando...' : 'Regenerar user profile'}
              </button>
            </div>

            <div>
              <FieldLabel
                title="JSON del user profile"
                subtitle="Puedes editarlo manualmente si hace falta."
              />
              <TextArea
                value={form.user_profile_json}
                onChange={(value) => updateField('user_profile_json', value)}
                rows={14}
                placeholder='{"name":"Kike","study":"Ingeniería Informática"}'
              />
            </div>
          </SectionCard>
        )

      case 'model':
        return (
          <SectionCard
            title="Modelo y comportamiento"
            description="Modelo principal, temperatura y system prompt global."
          >
            <div>
              <FieldLabel title="Nombre del modelo" subtitle="Ejemplo: qwen/qwen3-14b" />
              <TextInput
                value={form.model_name}
                onChange={(value) => updateField('model_name', value)}
                placeholder="qwen/qwen3-14b"
              />
            </div>

            <div>
              <FieldLabel title="Temperature" subtitle="0 = más determinista" />
              <TextInput
                value={form.temperature}
                onChange={(value) => updateField('temperature', value)}
                placeholder="0"
              />
            </div>

            <div>
              <FieldLabel
                title="System prompt por defecto"
                subtitle="Prompt principal de Kai IA."
              />
              <TextArea
                value={form.system_prompt_default}
                onChange={(value) => updateField('system_prompt_default', value)}
                rows={18}
                placeholder="Escribe aquí el prompt principal..."
              />
            </div>
            <div>
              <FieldLabel
                title="Context length"
                subtitle="Tamaño máximo de contexto enviado al modelo. Ejemplo: 8192 o 16384."
              />
              <TextInput
                value={form.llm_context_length}
                onChange={(value) => updateField('llm_context_length', value)}
                placeholder="8192"
              />
            </div>
          </SectionCard>
        )

      case 'google':
        return (
          <SectionCard
            title="Integración con Google"
            description="OAuth, credenciales, token y scopes."
          >
            <div>
              <FieldLabel title="Redirect URI" subtitle="URL de callback para OAuth." />
              <TextInput
                value={form.google_redirect_uri}
                onChange={(value) => updateField('google_redirect_uri', value)}
                placeholder="http://localhost:8000/auth/google/callback"
              />
            </div>

            <div>
              <FieldLabel
                title="Fichero de credenciales"
                subtitle="Ruta absoluta al credentials.json."
              />
              <TextInput
                value={form.google_credentials_file}
                onChange={(value) => updateField('google_credentials_file', value)}
                placeholder="C:\\KaiIA\\credentials.json"
              />
            </div>

            <div>
              <FieldLabel title="Fichero de token" subtitle="Ruta absoluta al token.json." />
              <TextInput
                value={form.google_token_file}
                onChange={(value) => updateField('google_token_file', value)}
                placeholder="C:\\KaiIA\\token.json"
              />
            </div>

            <div>
              <FieldLabel title="Scopes" subtitle="Debe ser un JSON válido con una lista." />
              <TextArea
                value={form.google_scopes}
                onChange={(value) => updateField('google_scopes', value)}
                rows={10}
                placeholder='["https://www.googleapis.com/auth/gmail.modify"]'
              />
            </div>
          </SectionCard>
        )

      case 'gmail':
        return (
          <SectionCard
            title="Configuración de Gmail"
            description="Límite máximo total de adjuntos."
          >
            <div>
              <FieldLabel
                title="Tamaño máximo total de adjuntos"
                subtitle="Valor en bytes. Ejemplo: 18874368"
              />
              <TextInput
                value={form.email_max_total_size_attachment}
                onChange={(value) => updateField('email_max_total_size_attachment', value)}
                placeholder="18874368"
              />
            </div>
          </SectionCard>
        )

      case 'prompts':
        return (
          <SectionCard title="Prompts internos" description="Prompts específicos del backend.">
            <div>
              <FieldLabel
                title="Prompt: resumen de correo"
                subtitle="Usado para resumir emails completos."
              />
              <TextArea
                value={form['default_prompts.resume_mail']}
                onChange={(value) => updateField('default_prompts.resume_mail', value)}
                rows={8}
                placeholder="Prompt para resumen de correo..."
              />
            </div>

            <div>
              <FieldLabel
                title="Prompt: información básica del usuario"
                subtitle="Usado para generar el JSON del perfil."
              />
              <TextArea
                value={form['default_prompts.basic_user_information_json']}
                onChange={(value) =>
                  updateField('default_prompts.basic_user_information_json', value)
                }
                rows={12}
                placeholder="Prompt para perfil del usuario..."
              />
            </div>

            <div>
              <FieldLabel
                title="Prompt: título de chat"
                subtitle="Usado para generar títulos cortos automáticamente."
              />
              <TextArea
                value={form['default_prompts.chat_summary']}
                onChange={(value) => updateField('default_prompts.chat_summary', value)}
                rows={8}
                placeholder="Prompt para títulos de chat..."
              />
            </div>
          </SectionCard>
        )
      case 'tools':
        return (
          <SectionCard
            title="Activación de tools"
            description="Palabras clave que activan automáticamente las herramientas del backend."
          >
            <div>
              <FieldLabel
                title="Palabras clave para activar tools"
                subtitle="Debe ser un JSON válido con una lista de strings. Si el mensaje contiene alguna, se envían tools al modelo."
              />
              <TextArea
                value={form.tool_activation_keywords}
                onChange={(value) => updateField('tool_activation_keywords', value)}
                rows={18}
                placeholder='["correo","gmail","calendario","evento","recordatorio","drive"]'
              />
            </div>
          </SectionCard>
        )
      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#020617] text-slate-300">
        Cargando configuración...
      </div>
    )
  }

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-[#020617] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-[-60px] h-[320px] w-[320px] rounded-full bg-cyan-500/18 blur-3xl" />
        <div className="absolute right-[-80px] top-[10%] h-[340px] w-[340px] rounded-full bg-fuchsia-500/12 blur-3xl" />
        <div className="absolute bottom-[-100px] left-[20%] h-[300px] w-[300px] rounded-full bg-blue-500/12 blur-3xl" />
        <div className="absolute bottom-[12%] right-[18%] h-[220px] w-[220px] rounded-full bg-emerald-400/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
            backgroundSize: '44px 44px'
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_32%)]" />
      </div>

      <aside
        className={`relative z-10 shrink-0 border-r border-white/10 bg-white/[0.045] backdrop-blur-2xl transition-all duration-300 ${
          sidebarOpen ? 'w-[330px]' : 'w-0 overflow-hidden border-r-0'
        }`}
      >
        <div className="flex h-full flex-col overflow-hidden">
          <div className="border-b border-white/10 bg-white/[0.03] p-4">
            <div className="rounded-2xl border border-white/15 bg-white/[0.08] px-4 py-3 text-sm font-medium shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
              Bloques de configuración
            </div>

            <div className="relative mt-4">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar bloque..."
                className="w-full rounded-2xl border border-white/10 bg-black/20 py-3 pl-10 pr-4 text-sm text-white outline-none backdrop-blur-xl transition placeholder:text-slate-500 focus:border-cyan-300/30 focus:bg-black/25"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 [&::-webkit-scrollbar]:hidden">
            <div className="space-y-2">
              {filteredSections.map((section) => {
                const isActive = section.id === activeSection

                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`group w-full rounded-2xl border p-4 text-left transition ${
                      isActive
                        ? 'border-cyan-300/20 bg-white/[0.12] shadow-[0_8px_30px_rgba(34,211,238,0.08)]'
                        : 'border-white/5 bg-white/[0.04] hover:border-white/15 hover:bg-white/[0.08]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.08] text-cyan-200">
                        {section.icon}
                      </div>
                      <div className="min-w-0">
                        <h3 className="line-clamp-1 text-sm font-medium text-white">
                          {section.label}
                        </h3>
                        <p className="mt-1 line-clamp-2 text-sm text-slate-300/80">
                          {section.description}
                        </p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </aside>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-white/10 bg-white/[0.045] px-4 backdrop-blur-2xl">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((prev) => !prev)}
              className="rounded-2xl border border-white/10 bg-white/[0.08] p-2.5 shadow-[0_8px_25px_rgba(0,0,0,0.18)] transition hover:bg-white hover:text-black"
            >
              <Menu size={18} />
            </button>

            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-400/10 text-cyan-200 backdrop-blur-xl">
                <Settings size={16} />
              </div>
              <div>
                <h1 className="text-sm font-semibold md:text-base">Configuración</h1>
                <p className="text-xs text-slate-400">Local + runtime del backend</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReload}
              disabled={loading || saving || regeneratingProfile}
              className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm backdrop-blur-xl transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RefreshCw size={16} />
              Recargar
            </button>

            <button
              onClick={handleReset}
              disabled={saving || regeneratingProfile}
              className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm backdrop-blur-xl transition hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              <FolderOpen size={16} />
              Descartar
            </button>

            <button
              onClick={handleSave}
              disabled={saving || regeneratingProfile}
              className="flex items-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100 backdrop-blur-xl transition hover:bg-cyan-300 hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Save size={16} />
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-3">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.045] shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
            <div className="relative border-b border-white/10 px-6 py-5">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
              <h2 className="text-lg font-semibold">
                {SECTION_ITEMS.find((s) => s.id === activeSection)?.label ?? 'Configuración'}
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                {SECTION_ITEMS.find((s) => s.id === activeSection)?.description ?? ''}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6 [&::-webkit-scrollbar]:hidden">
              <div className="mx-auto flex max-w-5xl flex-col gap-4">
                {saveMessage ? (
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                    {saveMessage}
                  </div>
                ) : null}

                {errorMessage ? (
                  <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                    {errorMessage}
                  </div>
                ) : null}

                {hasChanges ? (
                  <div className="rounded-2xl border border-cyan-300/10 bg-cyan-400/5 px-4 py-3 text-sm text-cyan-100">
                    Hay cambios sin guardar.
                  </div>
                ) : null}

                {renderSectionContent()}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default SettingsPage
