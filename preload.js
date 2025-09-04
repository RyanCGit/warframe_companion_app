const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    getAppVersion: () => ipcRenderer.invoke('app-version'),
    showMessageBox: (options) => ipcRenderer.invoke('show-message-box', options),
    
    // Platform detection
    platform: process.platform,
    
    // Environment detection
    isDev: process.argv.includes('--dev')
});

// Expose app instance to global window for menu interactions
contextBridge.exposeInMainWorld('electronApp', {
    // Will be populated by the renderer after app initialization
    setAppInstance: null
});

console.log('Preload script loaded successfully');