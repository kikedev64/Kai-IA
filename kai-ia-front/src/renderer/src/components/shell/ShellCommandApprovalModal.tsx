import { Terminal, X, Check, Ban, AlertTriangle } from 'lucide-react'
import React from 'react'

export type ShellApprovalRequest = {
  approvalId: string
  toolName: string
  command: string
  args: Record<string, unknown>
  parseError?: boolean
}

type Props = {
  request: ShellApprovalRequest
  onApprove: () => void
  onDeny: () => void
}

/**
 * Approval dialog shown when the assistant requests to run a shell command.
 *
 * Args:
 *   request: Pending shell command details emitted via the SSE stream.
 *   onApprove: Called when the user allows execution.
 *   onDeny: Called when the user refuses execution.
 *
 * Returns:
 *   React.JSX.Element
 */
export default function ShellCommandApprovalModal({
  request,
  onApprove,
  onDeny
}: Props): React.JSX.Element {

  const workingDir = typeof request.args.working_dir === 'string'
    ? request.args.working_dir
    : null

  const timeout = typeof request.args.timeout === 'number'
    ? request.args.timeout
    : null

  const hasParseError = request.parseError === true || request.args.parse_error === true

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center">
      <div className="flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">

        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-500/15">
            <Terminal className="h-4 w-4 text-yellow-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">Permiso de ejecución</p>
            <p className="text-xs text-slate-400">
              El asistente quiere ejecutar un comando en el sistema
            </p>
          </div>
          <button
            onClick={onDeny}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Rechazar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {hasParseError && (
          <div className="flex items-start gap-2 border-b border-red-500/20 bg-red-500/10 px-5 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <p className="text-xs text-red-300">
              El modelo generó JSON inválido en los argumentos del comando. No se puede ejecutar.
              El error ha sido notificado al modelo para que reformule la petición.
            </p>
          </div>
        )}

        <div className="px-5 py-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">
            Comando
          </p>
          <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-mono text-cyan-300 whitespace-pre-wrap break-all">
            {request.command || <span className="text-slate-500 italic">— sin comando —</span>}
          </pre>

          {(workingDir || timeout) && (
            <div className="mt-3 flex flex-wrap gap-3">
              {workingDir && (
                <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5">
                  <span className="text-xs text-slate-400">Directorio:</span>
                  <span className="text-xs font-mono text-slate-200">{workingDir}</span>
                </div>
              )}
              {timeout && (
                <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5">
                  <span className="text-xs text-slate-400">Timeout:</span>
                  <span className="text-xs font-mono text-slate-200">{timeout}s</span>
                </div>
              )}
            </div>
          )}

          <p className="mt-3 text-xs text-slate-500">
            Revisa el comando antes de aceptar. Solo se ejecutará en tu máquina local.
          </p>
        </div>

        <div className="flex gap-3 border-t border-white/10 px-5 py-4">
          <button
            onClick={onDeny}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <Ban className="h-4 w-4" />
            Rechazar
          </button>
          <button
            onClick={onApprove}
            disabled={hasParseError}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 active:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check className="h-4 w-4" />
            Ejecutar
          </button>
        </div>
      </div>
    </div>
  )
}
