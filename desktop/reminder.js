/*
 * Guild War reminder (DEVLOG #50): the game's standby page says "War Begins in 29h"; the watcher turns that into a
 * time (js/vision/readers/guild-standby.js) and hands it over (E7Desktop.guildStandby). This keeps ONE timer and
 * fires a desktop notification a while before the war begins, also when the app was restarted in between.
 * Pure scheduling (clock, timer and notification are passed in), so it is unit-tested without Electron.
 *
 *   const r = create({ now, setTimer, clearTimer, notify, load, save, leadMs = 30 min })
 *   r.set(beginsAtISO)   a new reading; ignored when it is the war already scheduled or already announced
 *                        (readings of the same war differ by up to an hour: the game shows whole hours)
 *   r.restore()          after a restart: schedule from what was saved
 *   r.state()            { beginsAt, firedFor }
 * notify({ title, body, minutes }) is called once per war.
 */
const SAME_WAR_MS = 3 * 3600 * 1000; // two readings closer than this are the same war
const MAX_TIMER_MS = 2 ** 31 - 1000; // setTimeout's limit (24.8 days)

function create(opts) {
  const now = opts.now || (() => Date.now());
  const setTimer = opts.setTimer || setTimeout;
  const clearTimer = opts.clearTimer || clearTimeout;
  const lead = opts.leadMs === undefined ? 30 * 60000 : opts.leadMs;
  let st = { beginsAt: '', firedFor: '' };
  let timer = null;
  const persist = () => opts.save && opts.save({ ...st });
  const same = (a, b) => !!a && !!b && Math.abs(Date.parse(a) - Date.parse(b)) < SAME_WAR_MS;

  function fire() {
    timer = null;
    const left = Date.parse(st.beginsAt) - now();
    if (!st.beginsAt || left <= 0 || same(st.firedFor, st.beginsAt)) return;
    st.firedFor = st.beginsAt;
    persist();
    const minutes = Math.max(1, Math.round(left / 60000));
    opts.notify({ title: 'Guild War begins soon', body: `The next Guild War begins in about ${minutes >= 90 ? `${Math.round(minutes / 60)} hours` : `${minutes} minutes`} (the game shows whole hours, so it can be a little earlier).`, minutes });
  }
  function schedule() {
    if (timer) clearTimer(timer);
    timer = null;
    const t = Date.parse(st.beginsAt);
    if (!st.beginsAt || !(t > now()) || same(st.firedFor, st.beginsAt)) return;
    timer = setTimer(fire, Math.min(MAX_TIMER_MS, Math.max(1000, t - lead - now())));
  }
  return {
    set(beginsAt) {
      const t = Date.parse(beginsAt);
      if (!(t > now())) return false; // no time, or already over
      // the same war read again: keep the EARLIER estimate (never remind later than the first reading promised)
      if (same(st.beginsAt, beginsAt) && Date.parse(st.beginsAt) <= t) return false;
      st.beginsAt = new Date(t).toISOString();
      persist();
      schedule();
      return true;
    },
    restore() {
      const v = (opts.load && opts.load()) || {};
      st = { beginsAt: v.beginsAt || '', firedFor: v.firedFor || '' };
      schedule();
    },
    state: () => ({ ...st }),
  };
}

module.exports = { create, SAME_WAR_MS };
