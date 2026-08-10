/* ws.js — WebSocket client: connect, request/response, event pub/sub. */

class KEClient {
  constructor() {
    this.socket = null;
    this.url = null;
    this.pending = new Map();
    this.listeners = {};
    this.reconnectTimer = null;
    this.reconnectDelay = 1000;
    this.shouldReconnect = false;
  }

  on(event, cb) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  }

  emit(event, payload) {
    (this.listeners[event] || []).forEach((cb) => {
      try {
        cb(payload);
      } catch (e) {
        console.error(e);
      }
    });
  }

  connect(url) {
    this.url = url;
    this.shouldReconnect = true;
    this.reconnectDelay = 1000;
    return this._open();
  }

  _open() {
    return new Promise((resolve, reject) => {
      let settled = false;
      let socket;
      try {
        socket = new WebSocket(this.url);
      } catch (e) {
        reject(e);
        return;
      }
      this.socket = socket;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Délai de connexion dépassé.'));
          socket.close();
        }
      }, 8000);

      socket.addEventListener('open', () => {
        clearTimeout(timeout);
        this.reconnectDelay = 1000;
        this.emit('open');
        if (!settled) {
          settled = true;
          resolve();
        }
      });

      socket.addEventListener('message', (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch (e) {
          return;
        }
        if (msg.event) {
          this.emit(msg.event, msg);
        } else if (msg.reqId && this.pending.has(msg.reqId)) {
          const { resolve: res, reject: rej } = this.pending.get(msg.reqId);
          this.pending.delete(msg.reqId);
          if (msg.ok) res(msg.data);
          else rej(new Error(msg.error || 'Erreur inconnue.'));
        }
      });

      socket.addEventListener('close', () => {
        clearTimeout(timeout);
        this.emit('close');
        if (!settled) {
          settled = true;
          reject(new Error('Impossible de se connecter au serveur.'));
        }
        for (const { reject: rej } of this.pending.values()) {
          rej(new Error('Connexion perdue.'));
        }
        this.pending.clear();
        if (this.shouldReconnect) this._scheduleReconnect();
      });

      socket.addEventListener('error', () => {
        this.emit('error');
      });
    });
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this._open().catch(() => {
        if (this.shouldReconnect) this._scheduleReconnect();
      });
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 15000);
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) this.socket.close();
  }

  request(action, payload = {}) {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        reject(new Error('Non connecté au serveur.'));
        return;
      }
      const reqId = Math.random().toString(36).slice(2) + Date.now().toString(36);
      const timer = setTimeout(() => {
        if (this.pending.has(reqId)) {
          this.pending.delete(reqId);
          reject(new Error('Délai de la requête dépassé.'));
        }
      }, 10000);
      this.pending.set(reqId, {
        resolve: (data) => {
          clearTimeout(timer);
          resolve(data);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      this.socket.send(JSON.stringify({ reqId, action, payload }));
    });
  }
}

const ke = new KEClient();

function resolveServerUrl(raw) {
  raw = (raw || '').trim();
  if (!raw) throw new Error('L’adresse du serveur est requise.');
  if (/^wss?:\/\//i.test(raw)) return raw;
  const scheme = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
  return scheme + raw;
}
