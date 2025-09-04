const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// Keep a global reference of the window object
let mainWindow;

// Enable live reload for development
if (process.argv.includes('--dev')) {
    require('electron-reload')(__dirname, {
        electron: path.join(__dirname, '..', 'node_modules', '.bin', 'electron'),
        hardResetMethod: 'exit'
    });
}

function createWindow() {
    // Create the browser window
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: true,
            allowRunningInsecureContent: false,
            experimentalFeatures: false
        },
        icon: path.join(__dirname, 'assets', 'icon.png'),
        titleBarStyle: 'default',
        show: false,
        backgroundColor: '#0a0a0f',
        webSecurity: true
    });

    // Load the index.html file
    mainWindow.loadFile('index.html');

    // Show window when ready to prevent visual flash
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        
        // Focus on the search input when window is shown
        mainWindow.webContents.executeJavaScript(`
            const searchInput = document.getElementById('itemSearch');
            if (searchInput) searchInput.focus();
        `);
    });

    // Handle window closed
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Handle external links
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // Prevent navigation to external URLs
    mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
        const parsedUrl = new URL(navigationUrl);
        
        // Allow navigation within the app or to Warframe Market API
        if (parsedUrl.origin !== 'file://' && !parsedUrl.host.includes('warframe.market')) {
            event.preventDefault();
        }
    });

    // Set up the application menu
    createApplicationMenu();

    // Development tools and force refresh
    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }
    
    // Force reload CSS for development
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.executeJavaScript(`
            // Force reload stylesheets
            const links = document.querySelectorAll('link[rel="stylesheet"]');
            links.forEach(link => {
                const href = link.href;
                link.href = href + '?t=' + Date.now();
            });
        `);
    });
}

function createApplicationMenu() {
    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'Refresh Data',
                    accelerator: 'F5',
                    click: () => {
                        mainWindow.webContents.executeJavaScript(`
                            if (window.app && window.app.handleRetry) {
                                window.app.handleRetry();
                            }
                        `);
                    }
                },
                { type: 'separator' },
                {
                    label: 'Exit',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                    click: () => {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectall' }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Search',
            submenu: [
                {
                    label: 'Focus Search',
                    accelerator: 'Ctrl+F',
                    click: () => {
                        mainWindow.webContents.executeJavaScript(`
                            const searchInput = document.getElementById('itemSearch');
                            if (searchInput) {
                                searchInput.focus();
                                searchInput.select();
                            }
                        `);
                    }
                },
                {
                    label: 'Clear Search',
                    accelerator: 'Ctrl+L',
                    click: () => {
                        mainWindow.webContents.executeJavaScript(`
                            const searchInput = document.getElementById('itemSearch');
                            if (searchInput) {
                                searchInput.value = '';
                                searchInput.focus();
                            }
                        `);
                    }
                }
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'About Warframe Market Tracker',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'About',
                            message: 'Warframe Market Tracker',
                            detail: 'A desktop application for tracking Warframe Market prices and statistics.\n\nVersion: 1.0.0\nBuilt with Electron'
                        });
                    }
                },
                {
                    label: 'Warframe Market Website',
                    click: () => {
                        shell.openExternal('https://warframe.market');
                    }
                },
                { type: 'separator' },
                {
                    label: 'Report Issues',
                    click: () => {
                        shell.openExternal('https://github.com/warframe-market-tracker/app/issues');
                    }
                }
            ]
        }
    ];

    // macOS specific menu adjustments
    if (process.platform === 'darwin') {
        template.unshift({
            label: app.getName(),
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideothers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
            ]
        });

        // Window menu
        template[4].submenu = [
            { role: 'close' },
            { role: 'minimize' },
            { role: 'zoom' },
            { type: 'separator' },
            { role: 'front' }
        ];
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// Disable GPU acceleration to fix GPU process errors
app.commandLine.appendSwitch('--disable-gpu');
app.commandLine.appendSwitch('--disable-gpu-sandbox');
app.commandLine.appendSwitch('--disable-software-rasterizer');
app.commandLine.appendSwitch('--disable-gpu-process-crash-limit');
app.commandLine.appendSwitch('--no-sandbox');

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
    createWindow();

    // On macOS, re-create window when dock icon is clicked
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });

    // Check for updates (in production)
    if (!process.argv.includes('--dev')) {
        autoUpdater.checkForUpdatesAndNotify();
    }
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
    // On macOS, keep the app running even when all windows are closed
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
    contents.on('new-window', (event, navigationUrl) => {
        event.preventDefault();
        shell.openExternal(navigationUrl);
    });
});

// Handle app certificate errors
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    if (url.includes('warframe.market') || url.includes('api.warframe.market')) {
        // Allow Warframe Market certificates
        event.preventDefault();
        callback(true);
    } else {
        callback(false);
    }
});

// IPC handlers for renderer process communication
ipcMain.handle('app-version', () => {
    return app.getVersion();
});

ipcMain.handle('show-message-box', async (event, options) => {
    const result = await dialog.showMessageBox(mainWindow, options);
    return result;
});

// Handle protocol for deep linking (optional)
app.setAsDefaultProtocolClient('warframe-market-tracker');

// Auto-updater events
autoUpdater.on('checking-for-update', () => {
    console.log('Checking for update...');
});

autoUpdater.on('update-available', (info) => {
    console.log('Update available.');
});

autoUpdater.on('update-not-available', (info) => {
    console.log('Update not available.');
});

autoUpdater.on('error', (err) => {
    console.log('Error in auto-updater. ' + err);
});

autoUpdater.on('download-progress', (progressObj) => {
    let log_message = "Download speed: " + progressObj.bytesPerSecond;
    log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
    log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
    console.log(log_message);
});

autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded');
    autoUpdater.quitAndInstall();
});