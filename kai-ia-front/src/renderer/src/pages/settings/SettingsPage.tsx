import React, { useMemo, useState } from 'react'
import {
  Menu,
  Settings,
  Save,
  RefreshCw,
  Bot,
  Mail,
  CalendarDays,
  CheckSquare,
  FolderOpen,
  KeyRound,
  SlidersHorizontal,
  ShieldCheck,
  Search
} from 'lucide-react'

type SettingsSectionId =
  | 'general'
  | 'model'
  | 'google'
  | 'gmail'
  | 'calendar'
  | 'tasks'
  | 'drive'
  | 'prompts'

type SettingsForm = {
  system_prompt_default: string
  model_name: string
  temperature: string
  google_redirect_uri: string
  google_credentials_file: string
  google_token_file: string
  google_scopes: string
  email_max_total_size_attachment: string
  default_prompts_resume_mail: string
  default_prompts_basic_user_information_json: string
  default_prompts_chat_summary: string
}

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
    description: 'Parámetros globales del asistente',
    icon: <SlidersHorizontal size={16} />
  },
  {
    id: 'model',
    label: 'Modelo',
    description: 'LLM, temperatura y comportamiento base',
    icon: <Bot size={16} />
  },
  {
    id: 'google',
    label: 'Google',
    description: 'OAuth, credenciales y token',
    icon: <ShieldCheck size={16} />
  },
  {
    id: 'gmail',
    label: 'Gmail',
    description: 'Opciones de correo y límites',
    icon: <Mail size={16} />
  },
  {
    id: 'calendar',
    label: 'Calendar',
    description: 'Configuración del calendario',
    icon: <CalendarDays size={16} />
  },
  {
    id: 'tasks',
    label: 'Tasks',
    description: 'Recordatorios y listas',
    icon: <CheckSquare size={16} />
  },
  {
    id: 'drive',
    label: 'Drive',
    description: 'Archivos y rutas relacionadas',
    icon: <FolderOpen size={16} />
  },
  {
    id: 'prompts',
    label: 'Prompts',
    description: 'Prompts internos del sistema',
    icon: <KeyRound size={16} />
  }
]

const DEFAULT_FORM: SettingsForm = {
  system_prompt_default:
    'Eres Kai IA, una secretaria personal de alto nivel que ayuda al usuario con correo, calendario, tareas y documentos.',
  model_name: 'openai/gpt-oss-20b',
  temperature: '0',
  google_redirect_uri: 'http://localhost:8000/auth/google/callback',
  google_credentials_file: 'C:\\KaiIA\\credentials.json',
  google_token_file: 'C:\\KaiIA\\token.json',
  google_scopes:
    '["https://www.googleapis.com/auth/gmail.modify","https://www.googleapis.com/auth/calendar","https://www.googleapis.com/auth/drive.readonly"]',
  email_max_total_size_attachment: '18874368',
  default_prompts_resume_mail:
    'Tu única tarea es leer el correo y hacer un resumen completo, detallado y exhaustivo.',
  default_prompts_basic_user_information_json:
    'Extrae la información relevante del usuario y devuélvela en JSON válido.',
  default_prompts_chat_summary:
    'Genera un título corto, claro y descriptivo para el chat en español.'
}

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

const SettingsPage = (): React.JSX.Element => {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('general')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<SettingsForm>(DEFAULT_FORM)
  const [initialForm] = useState<SettingsForm>(DEFAULT_FORM)
  const [saveMessage, setSaveMessage] = useState('')

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

  const updateField = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) => {
    setForm((prev) => ({
      ...prev,
      [key]: value
    }))
  }

  const handleReset = () => {
    setForm(DEFAULT_FORM)
    setSaveMessage('Cambios visuales restablecidos.')
  }

  const handleFakeSave = () => {
    setSaveMessage('Plantilla visual: guardado no conectado todavía.')
  }

  const renderSectionContent = () => {
    switch (activeSection) {
      case 'general':
        return (
          <SectionCard
            title="Configuración general"
            description="Parámetros base del comportamiento del sistema."
          >
            <div>
              <FieldLabel
                title="System prompt por defecto"
                subtitle="Prompt principal que usará Kai IA al iniciar un chat."
              />
              <TextArea
                value={form.system_prompt_default}
                onChange={(value) => updateField('system_prompt_default', value)}
                rows={8}
                placeholder="Escribe aquí el prompt por defecto del sistema..."
              />
            </div>
          </SectionCard>
        )

      case 'model':
        return (
          <SectionCard
            title="Configuración del modelo"
            description="Ajusta el modelo principal y sus parámetros de generación."
          >
            <div>
              <FieldLabel title="Nombre del modelo" subtitle="Ejemplo: openai/gpt-oss-20b" />
              <TextInput
                value={form.model_name}
                onChange={(value) => updateField('model_name', value)}
                placeholder="openai/gpt-oss-20b"
              />
            </div>

            <div>
              <FieldLabel
                title="Temperature"
                subtitle="Controla la creatividad. 0 = más determinista."
              />
              <TextInput
                value={form.temperature}
                onChange={(value) => updateField('temperature', value)}
                placeholder="0"
              />
            </div>
          </SectionCard>
        )

      case 'google':
        return (
          <SectionCard
            title="Integración con Google"
            description="Parámetros OAuth, token y credenciales."
          >
            <div>
              <FieldLabel
                title="Redirect URI"
                subtitle="URL de callback para la autenticación OAuth."
              />
              <TextInput
                value={form.google_redirect_uri}
                onChange={(value) => updateField('google_redirect_uri', value)}
                placeholder="http://localhost:8000/auth/google/callback"
              />
            </div>

            <div>
              <FieldLabel title="Fichero de credenciales" subtitle="Ruta al credentials.json." />
              <TextInput
                value={form.google_credentials_file}
                onChange={(value) => updateField('google_credentials_file', value)}
                placeholder="C:\\ruta\\credentials.json"
              />
            </div>

            <div>
              <FieldLabel title="Fichero de token" subtitle="Ruta al token.json." />
              <TextInput
                value={form.google_token_file}
                onChange={(value) => updateField('google_token_file', value)}
                placeholder="C:\\ruta\\token.json"
              />
            </div>

            <div>
              <FieldLabel title="Scopes" subtitle="Lista JSON de scopes de Google." />
              <TextArea
                value={form.google_scopes}
                onChange={(value) => updateField('google_scopes', value)}
                rows={8}
                placeholder='["https://www.googleapis.com/auth/gmail.modify"]'
              />
            </div>
          </SectionCard>
        )

      case 'gmail':
        return (
          <SectionCard
            title="Configuración de Gmail"
            description="Límites y comportamiento del servicio de correo."
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

      case 'calendar':
        return (
          <SectionCard
            title="Google Calendar"
            description="Bloque visual preparado para futuras opciones."
          >
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-slate-400">
              Aquí podrás añadir zona horaria por defecto, duración de eventos, recordatorios,
              Google Meet automático y más.
            </div>
          </SectionCard>
        )

      case 'tasks':
        return (
          <SectionCard
            title="Google Tasks"
            description="Bloque visual preparado para futuras opciones."
          >
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-slate-400">
              Aquí podrás añadir lista por defecto, comportamiento de recordatorios y opciones de
              sincronización.
            </div>
          </SectionCard>
        )

      case 'drive':
        return (
          <SectionCard
            title="Google Drive"
            description="Bloque visual preparado para futuras opciones."
          >
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-slate-400">
              Aquí podrás añadir límites, formatos por defecto, políticas de búsqueda y control de
              exportaciones.
            </div>
          </SectionCard>
        )

      case 'prompts':
        return (
          <SectionCard
            title="Prompts internos"
            description="Prompts específicos usados por el sistema."
          >
            <div>
              <FieldLabel
                title="Prompt: resumen de correo"
                subtitle="Usado para resumir un email completo."
              />
              <TextArea
                value={form.default_prompts_resume_mail}
                onChange={(value) => updateField('default_prompts_resume_mail', value)}
                rows={6}
                placeholder="Prompt para resume_mail..."
              />
            </div>

            <div>
              <FieldLabel
                title="Prompt: información básica del usuario"
                subtitle="Usado para generar JSON de perfil."
              />
              <TextArea
                value={form.default_prompts_basic_user_information_json}
                onChange={(value) =>
                  updateField('default_prompts_basic_user_information_json', value)
                }
                rows={8}
                placeholder="Prompt para basic_user_information..."
              />
            </div>

            <div>
              <FieldLabel
                title="Prompt: título de chat"
                subtitle="Usado para generar títulos cortos automáticamente."
              />
              <TextArea
                value={form.default_prompts_chat_summary}
                onChange={(value) => updateField('default_prompts_chat_summary', value)}
                rows={6}
                placeholder="Prompt para chat_summary..."
              />
            </div>
          </SectionCard>
        )

      default:
        return null
    }
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
                <p className="text-xs text-slate-400">Plantilla visual de parámetros del sistema</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm backdrop-blur-xl transition hover:bg-white hover:text-black"
            >
              <RefreshCw size={16} />
              Restablecer
            </button>

            <button
              onClick={handleFakeSave}
              className="flex items-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100 backdrop-blur-xl transition hover:bg-cyan-300 hover:text-black"
            >
              <Save size={16} />
              Guardar
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
                  <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-slate-200">
                    {saveMessage}
                  </div>
                ) : null}

                {hasChanges ? (
                  <div className="rounded-2xl border border-cyan-300/10 bg-cyan-400/5 px-4 py-3 text-sm text-cyan-100">
                    Hay cambios visuales sin persistir.
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