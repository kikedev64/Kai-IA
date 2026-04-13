import { app, ipcMain } from 'electron'
import { configRepository } from '../db/config.repository'
import { getBackendBaseUrl } from '../db/database'

export function registerConfigIpc(): void {
    ipcMain.handle('config:is-first-run', () => {
        return configRepository.isFirstRun()
    })

    ipcMain.handle('config:set-first-run', (_event, value: boolean) => {
        configRepository.setFirstRun(value)
        return true
    })

    ipcMain.handle('config:get-server-url', () => {
        return configRepository.getServerUrl()
    })

    ipcMain.handle('config:set-server-url', (_event, url: string) => {
        configRepository.setServerUrl(url)
        return true
    })

    ipcMain.handle('config:get-server-port', () => {
        return configRepository.getServerPort()
    })

    ipcMain.handle('config:set-server-port', (_event, port: number) => {
        configRepository.setServerPort(port)
        return true
    })

    ipcMain.handle('config:get-user-profile-raw', () => {
        return configRepository.getUserProfileRaw()
    })

    ipcMain.handle('config:set-user-profile-raw', (_event, raw: string) => {
        configRepository.setUserProfileRaw(raw)
        return true
    })

    ipcMain.handle('config:get-user-profile-json', () => {
        return configRepository.getUserProfileJson()
    })

    ipcMain.handle('config:set-user-profile-json', (_event, profile) => {
        configRepository.setUserProfileJson(profile)
        return true
    })

    ipcMain.handle('config:complete-onboarding', () => {
        configRepository.markOnboardingCompleted()
        return true
    })

    ipcMain.handle('config:get-onboarding-completed', () => {
        return configRepository.getOnboardingCompleted()
    })

    ipcMain.handle('config:set-onboarding-completed', (_event, value: boolean) => {
        configRepository.setOnboardingCompleted(value)
        return true
    })

    ipcMain.handle('config:reset-onboarding-state', () => {
        configRepository.setOnboardingCompleted(false)
        return true
    })

    ipcMain.handle('app:quit', () => {
        app.quit()
    })

    ipcMain.handle('config:get-all-backend', async () => {
        const baseUrl = await getBackendBaseUrl()
        const res = await fetch(`${baseUrl}/config`)

        if (!res.ok) {
            throw new Error(`Error obteniendo configuración backend: ${res.status}`)
        }

        return await res.json()
    })

    ipcMain.handle('config:get-backend', async (_event, key: string) => {
        const baseUrl = await getBackendBaseUrl()
        const url = new URL(`${baseUrl}/config`)
        url.searchParams.set('key', key)

        const res = await fetch(url.toString())

        if (!res.ok) {
            throw new Error(`Error obteniendo la key ${key}: ${res.status}`)
        }

        return await res.json()
    })

    ipcMain.handle(
        'config:set-backend',
        async (_event, payload: { key: string; value: string }) => {
            const baseUrl = await getBackendBaseUrl()

            const res = await fetch(`${baseUrl}/config`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            })

            if (!res.ok) {
                throw new Error(`Error guardando configuración backend: ${res.status}`)
            }

            return await res.json()
        }
        
    )

    ipcMain.handle(
        'config:set-many-backend',
        async (_event, entries: Record<string, string>) => {
            const baseUrl = await getBackendBaseUrl()

            const results: Array<{ key: string; value: string; updated_at?: string }> = []

            for (const [key, value] of Object.entries(entries)) {
                const res = await fetch(`${baseUrl}/config`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ key, value })
                })

                if (!res.ok) {
                    throw new Error(`Error guardando ${key}: ${res.status}`)
                }

                const json = await res.json()
                if (json?.item) {
                    results.push(json.item)
                }
            }

            return {
                ok: true,
                items: results
            }
        }
    )

}