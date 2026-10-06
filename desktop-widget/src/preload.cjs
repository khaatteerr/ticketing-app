const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('widget', {
  state: () => ipcRenderer.invoke('widget:state'),
  login: data => ipcRenderer.invoke('widget:login', data),
  logout: () => ipcRenderer.invoke('widget:logout'),
  list: data => ipcRenderer.invoke('widget:list', data),
  submit: data => ipcRenderer.invoke('widget:submit', data),
  open: focus => ipcRenderer.send('widget:open', Boolean(focus)),
  hide: () => ipcRenderer.send('widget:hide'),
  menu: () => ipcRenderer.send('widget:menu'),
  drag: phase => ipcRenderer.send('widget:drag', phase),
  browser: () => ipcRenderer.invoke('widget:browser')
});
