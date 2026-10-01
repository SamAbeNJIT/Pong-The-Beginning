// The only bridge between the UI and the app: a fixed list of calls, no Node access.
const { contextBridge, ipcRenderer } = require("electron");

const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld("forge", {
  init: call("init"),
  listGames: call("games:list"),
  image: call("image"),
  saveKey: call("key:save"),
  clearKey: call("key:clear"),
  chooseGamesDir: call("games:choose-dir"),
  installBrowser: call("setup:browser"),
  build: call("job:build"),
  change: call("job:change"),
  cancel: call("job:cancel"),
  dismiss: call("job:dismiss"),
  play: call("game:play"),
  reveal: call("game:reveal"),
  onJob: (fn) => ipcRenderer.on("job", (_e, msg) => fn(msg)),
});
