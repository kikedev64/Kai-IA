import { ipcMain } from 'electron'
import { configRepository } from '../db/config.repository'

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
    })
}