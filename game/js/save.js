/* Neon Tide — save system. One localStorage slot; autosaves after missions
   and every 30 seconds while playing. */
'use strict';

const SAVE_KEY = 'neon-tide-palmera-bay-save-v1';

const Save = {
  /* The current save, or null when no save exists yet. */
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return null;
      return data;
    } catch (e) {
      return null;
    }
  },

  hasSave() { return this.load() !== null; },

  saveGame() {
    if (!Game || Game.state !== 'playing') return false;
    try {
      const data = {
        version: 1,
        savedAt: Date.now(),
        cash: Game.cash,
        missionIndex: MissionManager.index,
        missionState: MissionManager.state,
        health: Game.player.health,
        weapon: Game.player.weapon,
        ammo: Game.player.ammo,
        x: Game.player.x,
        y: Game.player.y,
        kills: Game.stats.kills,
        carsStolen: Game.stats.carsStolen,
        missionsDone: Game.stats.missionsDone,
        playMs: Game.stats.playMs,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  },

  clear() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* storage unavailable */ }
  },

  summary() {
    const d = this.load();
    if (!d) return null;
    const date = new Date(d.savedAt);
    const missionNo = Math.min(d.missionIndex + 1, MISSIONS.length);
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `Save: Mission ${missionNo} of ${MISSIONS.length} · $${fmtCash(d.cash)} · ${date.toLocaleDateString()} ${time}`;
  },
};
