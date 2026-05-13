const { app: electronApp, BrowserWindow, Menu } = require('electron');
const path = require('path');
const { registerIpcHandlers } = require('./src/ipc/ipcHandlers');

let mainWindow;

async function startApp() {
    try {
        console.log('🚀 Iniciando aplicación...');

        // Registrar handlers IPC
        registerIpcHandlers();

        // Crear ventana principal
        mainWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
            titleBarOverlay: false,
            autoHideMenuBar: electronApp.isPackaged,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js'),
                devTools: !electronApp.isPackaged
            }
        });

        // En build ocultamos la barra superior (File, View, etc.).
        if (electronApp.isPackaged) {
            Menu.setApplicationMenu(null);
            mainWindow.setMenuBarVisibility(false);
        }

        // Cargar el archivo HTML directamente
        mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));

        mainWindow.on('maximize', () => {
            if (mainWindow?.webContents && !mainWindow.webContents.isDestroyed()) {
                mainWindow.webContents.send('window-maximized-changed', true);
            }
        });

        mainWindow.on('unmaximize', () => {
            if (mainWindow?.webContents && !mainWindow.webContents.isDestroyed()) {
                mainWindow.webContents.send('window-maximized-changed', false);
            }
        });

        mainWindow.on('closed', () => {
            mainWindow = null;
        });

        console.log('✅ Aplicación iniciada correctamente');

    } catch (err) {
        console.error('❌ Error iniciando la app:', err);
        electronApp.quit();
    }
}

// Eventos de Electron
electronApp.on('ready', startApp);

electronApp.on('window-all-closed', () => {
    if (process.platform !== 'darwin') electronApp.quit();
});

electronApp.on('activate', () => {
    if (!mainWindow) startApp();
});
