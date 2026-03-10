const CARD_VERSION = "0.4.0";

console.info(
  `%c CTEK-NJORD-GO-CARD %c v${CARD_VERSION} `,
  "color: white; background: #1a73e8; font-weight: bold; padding: 2px 4px;",
  "color: #1a73e8; background: white; font-weight: bold; padding: 2px 4px;",
);

// ── helpers ──────────────────────────────────────────────────────────────────

/** Find all entity IDs belonging to a given device_id via the entity registry */
function entitiesForDevice(hass, deviceId) {
  const result = {};
  if (!hass.entities) return result;
  for (const [eid, entry] of Object.entries(hass.entities)) {
    if (entry.device_id === deviceId) {
      result[eid] = entry;
    }
  }
  return result;
}

/** Find entity_id by translation_key (language-independent) from registry entries.
 *  translation_key is the same for all connectors (e.g. "connector_status"),
 *  the connector number is only in translation_placeholders, not the key. */
function findByKey(entityMap, translationKey) {
  return Object.keys(entityMap).find(
    (eid) => entityMap[eid].translation_key === translationKey,
  );
}

// Ensure HA lazy-loaded components (ha-device-picker etc.) are available
(async () => {
  if (window.loadCardHelpers) {
    await window.loadCardHelpers();
  }
})();

// ── Njord GO SVG ─────────────────────────────────────────────────────────────

function njordSvg() {
  return `
    <svg viewBox="0 0 100 160" xmlns="http://www.w3.org/2000/svg" class="njord-svg">
      <!-- Cable coming from top -->
      <path d="M50 0 Q50 12 48 18" stroke="var(--secondary-text-color)" stroke-width="3.5"
            fill="none" stroke-linecap="round"/>

      <!-- Main body -->
      <rect x="22" y="18" width="56" height="95" rx="10" ry="10"
            fill="var(--card-background-color, #fff)"
            stroke="var(--secondary-text-color)" stroke-width="1.5"/>

      <!-- Inner face / bezel -->
      <rect x="28" y="24" width="44" height="60" rx="5" ry="5"
            fill="var(--primary-background-color, #f5f5f5)"
            stroke="var(--divider-color)" stroke-width="0.8"/>

      <!-- LED bar (the status indicator) -->
      <rect class="led-bar" x="32" y="30" width="36" height="6" rx="3" ry="3"
            fill="#555" opacity="0.3"/>
      <!-- LED glow overlay -->
      <rect class="led-glow" x="32" y="30" width="36" height="6" rx="3" ry="3"
            fill="transparent"/>

      <!-- CTEK logo text -->
      <text x="50" y="58" text-anchor="middle" font-family="Arial, sans-serif"
            font-size="10" font-weight="bold" letter-spacing="0.5"
            fill="var(--primary-text-color)">CTEK</text>

      <!-- Battery level indicator (4 segments) -->
      <g class="battery-segments" opacity="0">
        <rect class="bat-seg bat-seg-1" x="33" y="65" width="7" height="10" rx="1"
              fill="var(--success-color, #44b556)" opacity="0.25"/>
        <rect class="bat-seg bat-seg-2" x="42" y="65" width="7" height="10" rx="1"
              fill="var(--success-color, #44b556)" opacity="0.25"/>
        <rect class="bat-seg bat-seg-3" x="51" y="65" width="7" height="10" rx="1"
              fill="var(--success-color, #44b556)" opacity="0.25"/>
        <rect class="bat-seg bat-seg-4" x="60" y="65" width="7" height="10" rx="1"
              fill="var(--success-color, #44b556)" opacity="0.25"/>
      </g>

      <!-- Bottom section - plug pins -->
      <rect x="35" y="113" width="6" height="16" rx="1.5"
            fill="var(--secondary-text-color)"/>
      <rect x="59" y="113" width="6" height="16" rx="1.5"
            fill="var(--secondary-text-color)"/>

      <!-- Ground pin (middle, shorter) -->
      <rect x="47" y="113" width="6" height="12" rx="1.5"
            fill="var(--secondary-text-color)"/>
    </svg>
  `;
}

// ── Config editor ────────────────────────────────────────────────────────────

class CTEKNjordGoCardEditor extends HTMLElement {
  _config = {};
  _hass;

  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _render() {
    if (!this._hass) return;

    if (!this._rendered) {
      const wrapper = document.createElement("div");
      wrapper.style.padding = "16px";

      const heading = document.createElement("p");
      heading.innerHTML = "<b>CTEK Njord GO Card</b>";
      wrapper.appendChild(heading);

      const desc = document.createElement("p");
      desc.style.cssText = "margin-bottom:12px;color:var(--secondary-text-color);font-size:0.9em;";
      desc.textContent = "Select your CTEK charger device.";
      wrapper.appendChild(desc);

      this._picker = document.createElement("ha-device-picker");
      wrapper.appendChild(this._picker);

      this._picker.addEventListener("value-changed", (ev) => {
        if (ev.detail.value === this._config.device_id) return;
        this._config = { ...this._config, device_id: ev.detail.value };
        this._dispatch();
      });

      const label = document.createElement("label");
      label.style.cssText = "display:block;margin-top:12px;margin-bottom:4px;font-weight:500;";
      label.textContent = "Title (optional)";
      wrapper.appendChild(label);

      this._titleInput = document.createElement("input");
      this._titleInput.type = "text";
      this._titleInput.placeholder = "Njord GO";
      this._titleInput.style.cssText = "width:100%;padding:8px;border-radius:4px;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color);box-sizing:border-box;";
      wrapper.appendChild(this._titleInput);

      this._titleInput.addEventListener("input", (ev) => {
        this._config = { ...this._config, title: ev.target.value };
        this._dispatch();
      });

      this.appendChild(wrapper);
      this._rendered = true;
    }

    // Update picker values on every render
    this._picker.hass = this._hass;
    this._picker.value = this._config.device_id || "";
    this._picker.label = "Device";

    // Filter to CTEK integration devices only
    this._picker.deviceFilter = (device) => {
      if (!this._hass.entities) return true;
      for (const entry of Object.values(this._hass.entities)) {
        if (entry.device_id === device.id && entry.platform === "ctek") {
          return true;
        }
      }
      return false;
    };

    this._titleInput.value = this._config.title || "";
  }

  _dispatch() {
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: this._config },
        bubbles: true,
        composed: true,
      }),
    );
  }
}
customElements.define("ctek-njord-go-card-editor", CTEKNjordGoCardEditor);

// ── Main card ────────────────────────────────────────────────────────────────

const STATUS_META = {
  Available:     { color: "#888",    ledColor: "rgba(100,100,100,0.3)", label: "Available",         anim: "none",  bars: 0 },
  Charging:      { color: "#44b556", ledColor: "#44b556",               label: "Charging",          anim: "pulse", bars: "loop" },
  SuspendedEVSE: { color: "#ff9800", ledColor: "#ff9800",               label: "Suspended (EVSE)",  anim: "none",  bars: 2 },
  SuspendedEV:   { color: "#ff9800", ledColor: "#ff9800",               label: "Suspended (EV)",    anim: "none",  bars: 4 },
  Preparing:     { color: "#2196f3", ledColor: "#2196f3",               label: "Preparing",         anim: "blink", bars: 0 },
  Finishing:     { color: "#44b556", ledColor: "#44b556",               label: "Finishing",         anim: "none",  bars: 4 },
  Faulted:       { color: "#db4437", ledColor: "#db4437",               label: "Faulted",           anim: "none",  bars: 0 },
  Offline:       { color: "#999",    ledColor: "rgba(100,100,100,0.15)", label: "Offline",           anim: "none",  bars: 0 },
  Unavailable:   { color: "#999",    ledColor: "rgba(100,100,100,0.15)", label: "Unavailable",       anim: "none",  bars: 0 },
};

class CTEKNjordGoCard extends HTMLElement {
  _config = {};
  _hass;
  _deviceEntities = {};
  _entities = {};
  _root;

  // ── HA lifecycle ────────────────────────────────────────────────────────

  static getConfigElement() {
    return document.createElement("ctek-njord-go-card-editor");
  }

  static getStubConfig(hass) {
    if (hass.entities) {
      for (const entry of Object.values(hass.entities)) {
        if (entry.platform === "ctek" && entry.device_id) {
          return { device_id: entry.device_id, title: "" };
        }
      }
    }
    return { device_id: "", title: "" };
  }

  setConfig(config) {
    if (!config.device_id) {
      throw new Error("Please select a CTEK device in the card configuration.");
    }
    this._config = config;
    this._buildCard();
  }

  set hass(hass) {
    this._hass = hass;
    this._discoverEntities();
    this._update();
  }

  getCardSize() {
    return 5;
  }

  // ── entity discovery ───────────────────────────────────────────────────

  _discoverEntities() {
    const h = this._hass;
    if (!h) return;

    this._deviceEntities = entitiesForDevice(h, this._config.device_id);
    const k = (key) => findByKey(this._deviceEntities, key);

    this._entities = {
      connectorStatus:  k("connector_status"),
      connectorSwitch:  k("connector_charging"),
      online:           k("online"),
      cable:            k("cable_connected"),
      firmware:         k("firmware_available"),
      energy:           k("wh_consumed"),
      voltage:          k("voltage"),
      current:          k("current"),
      power:            k("power"),
      maxCurrent:       k("max_current"),
      ledIntensity:     k("led_intensity"),
      transactionId:    k("transaction_id"),
      startDate:        k("connector_start_date"),
    };
  }

  _state(key) {
    const eid = this._entities[key];
    if (!eid) return undefined;
    return this._hass.states[eid];
  }

  _val(key) {
    const s = this._state(key);
    return s ? s.state : undefined;
  }

  // ── card build ─────────────────────────────────────────────────────────

  _buildCard() {
    if (!this._root) {
      this._root = this.attachShadow({ mode: "open" });
    }
    this._root.innerHTML = `
      <style>${this._styles()}</style>
      <ha-card>
        <div class="card-header">
          <div class="header-row">
            <div class="header-left">
              <span class="title"></span>
            </div>
            <div class="header-right">
              <span class="badge online-badge"></span>
              <span class="badge cable-badge"></span>
            </div>
          </div>
        </div>
        <div class="card-content">
          <div class="device-row">
            <div class="device-illustration">
              ${njordSvg()}
            </div>
            <div class="device-info">
              <div class="status-row">
                <div class="status-section">
                  <span class="status-label"></span>
                  <span class="status-sub"></span>
                </div>
                <div class="charge-toggle">
                  <ha-icon class="toggle-btn" icon="mdi:power"></ha-icon>
                </div>
              </div>
              <div class="key-metrics">
                <div class="key-metric" id="m-power">
                  <span class="key-metric-val">\u2014</span>
                  <span class="key-metric-unit">kW</span>
                  <span class="key-metric-label">Power</span>
                </div>
                <div class="key-metric" id="m-energy">
                  <span class="key-metric-val">\u2014</span>
                  <span class="key-metric-unit">kWh</span>
                  <span class="key-metric-label">Session</span>
                </div>
              </div>
              <div class="secondary-metrics">
                <div class="metric" id="m-voltage">
                  <ha-icon icon="mdi:sine-wave"></ha-icon>
                  <span class="metric-val">\u2014</span><span class="metric-unit">V</span>
                </div>
                <div class="metric" id="m-current">
                  <ha-icon icon="mdi:current-ac"></ha-icon>
                  <span class="metric-val">\u2014</span><span class="metric-unit">A</span>
                </div>
              </div>
            </div>
          </div>
          <div class="controls">
            <div class="control-row" id="ctrl-max-current" style="display:none;">
              <span class="ctrl-label">Max current</span>
              <div class="ctrl-slider">
                <span class="ctrl-val"></span>
                <input type="range" min="6" max="16" step="2" />
              </div>
            </div>
            <div class="control-row" id="ctrl-led" style="display:none;">
              <span class="ctrl-label">LED brightness</span>
              <div class="ctrl-slider">
                <span class="ctrl-val"></span>
                <input type="range" min="0" max="100" step="1" />
              </div>
            </div>
          </div>
        </div>
      </ha-card>
    `;

    this._root.querySelector(".toggle-btn").addEventListener("click", () => this._toggleCharge());
    const slider = this._root.querySelector("#ctrl-max-current input");
    slider.addEventListener("change", (e) => this._setMaxCurrent(Number(e.target.value)));
    const ledSlider = this._root.querySelector("#ctrl-led input");
    ledSlider.addEventListener("change", (e) => this._setLedIntensity(Number(e.target.value)));

    // Charging bar loop animation (cycles 0→1→2→3→4→0… every 800ms)
    this._barFrame = 0;
    this._barTimer = setInterval(() => {
      if (!this._root) return;
      const statusVal = this._val("connectorStatus");
      const meta = STATUS_META[statusVal] || STATUS_META.Unavailable;
      if (meta.bars !== "loop") return;
      this._barFrame = (this._barFrame + 1) % 5; // 0,1,2,3,4
      const segs = this._root.querySelectorAll(".bat-seg");
      segs.forEach((seg, i) => {
        seg.setAttribute("opacity", i < this._barFrame ? "0.9" : "0.15");
      });
    }, 800);
  }

  disconnectedCallback() {
    if (this._barTimer) {
      clearInterval(this._barTimer);
      this._barTimer = null;
    }
  }

  // ── update ─────────────────────────────────────────────────────────────

  _update() {
    if (!this._root || !this._hass) return;
    const r = this._root;

    // Title
    const title = this._config.title || this._deviceName() || "Njord GO";
    r.querySelector(".title").textContent = title;

    // Online badge
    const onlineVal = this._val("online");
    const onlineBadge = r.querySelector(".online-badge");
    if (onlineVal !== undefined) {
      onlineBadge.style.display = "";
      const isOn = onlineVal === "on";
      onlineBadge.textContent = isOn ? "Online" : "Offline";
      onlineBadge.className = `badge online-badge ${isOn ? "badge--ok" : "badge--off"}`;
    } else {
      onlineBadge.style.display = "none";
    }

    // Cable badge
    const cableVal = this._val("cable");
    const cableBadge = r.querySelector(".cable-badge");
    if (cableVal !== undefined) {
      cableBadge.style.display = "";
      const plugged = cableVal === "on";
      cableBadge.textContent = plugged ? "Cable connected" : "No cable";
      cableBadge.className = `badge cable-badge ${plugged ? "badge--info" : "badge--muted"}`;
    } else {
      cableBadge.style.display = "none";
    }

    // Connector status
    const statusVal = this._val("connectorStatus") || "unavailable";
    const meta = STATUS_META[statusVal] || STATUS_META.Unavailable;
    r.querySelector(".status-label").textContent = meta.label || statusVal;
    r.querySelector(".status-label").style.color = meta.color;

    // Status subtitle
    const startDate = this._val("startDate");
    const subText = r.querySelector(".status-sub");
    if (statusVal === "Charging" && startDate && startDate !== "unknown" && startDate !== "unavailable") {
      try {
        const d = new Date(startDate);
        subText.textContent = `since ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      } catch {
        subText.textContent = "";
      }
    } else {
      subText.textContent = "";
    }

    // ── SVG LED update ──
    const ledGlow = r.querySelector(".led-glow");
    const ledBar = r.querySelector(".led-bar");
    const svg = r.querySelector(".njord-svg");
    if (ledGlow && ledBar) {
      // LED color
      ledGlow.setAttribute("fill", meta.ledColor);
      ledGlow.setAttribute("opacity", "1");

      // LED intensity from entity
      const ledVal = this._val("ledIntensity");
      const intensity = (ledVal && ledVal !== "unknown" && ledVal !== "unavailable")
        ? parseFloat(ledVal) / 100 : 1;
      ledGlow.setAttribute("opacity", String(Math.max(0.1, intensity)));

      // Animation class
      svg.classList.remove("led-pulse", "led-blink", "led-blink-fast");
      if (meta.anim === "pulse") svg.classList.add("led-pulse");
      else if (meta.anim === "blink") svg.classList.add("led-blink");
      else if (meta.anim === "blink-fast") svg.classList.add("led-blink-fast");
    }

    // Battery segments — static bar counts per state; "loop" handled by timer
    const batSegs = r.querySelector(".battery-segments");
    const bars = meta.bars;
    const showBars = bars === "loop" || (typeof bars === "number" && bars > 0);

    if (batSegs) {
      batSegs.setAttribute("opacity", showBars ? "1" : "0");
      // Color segments to match status
      const segColor = meta.color;
      const segs = batSegs.querySelectorAll(".bat-seg");
      segs.forEach((seg) => seg.setAttribute("fill", segColor));
      // Set static bar fill for non-looping states
      if (typeof bars === "number" && bars > 0) {
        segs.forEach((seg, i) => {
          seg.setAttribute("opacity", i < bars ? "0.9" : "0.15");
        });
      }
    }

    const isActiveSession = statusVal === "Charging" || statusVal === "SuspendedEV" ||
      statusVal === "SuspendedEVSE" || statusVal === "Preparing" || statusVal === "Finishing";

    // Toggle button
    const switchEntity = this._entities.connectorSwitch;
    const toggleBtn = r.querySelector(".charge-toggle");
    if (switchEntity) {
      toggleBtn.style.display = "";
      const swState = this._hass.states[switchEntity];
      const isCharging = swState && swState.state === "on";
      const btn = r.querySelector(".toggle-btn");
      btn.style.color = isCharging ? "var(--state-active-color, #44b556)" : "var(--state-icon-color)";
    } else {
      toggleBtn.style.display = "none";
    }

    // Key metrics — always visible: power in kW, energy in kWh
    const powerRaw = this._val("power");
    const energyRaw = this._val("energy");
    this._setKeyMetric(r, "m-power", powerRaw, 1000, 1);  // W → kW
    this._setKeyMetric(r, "m-energy", energyRaw, 1000, 2); // Wh → kWh

    // Secondary metrics — only during active session
    const secondaryEl = r.querySelector(".secondary-metrics");
    secondaryEl.style.display = isActiveSession ? "" : "none";
    if (isActiveSession) {
      this._setMetric(r, "m-voltage", this._val("voltage"));
      this._setMetric(r, "m-current", this._val("current"));
    }

    // Max current slider
    const maxCurrentState = this._state("maxCurrent");
    const ctrlRow = r.querySelector("#ctrl-max-current");
    if (maxCurrentState) {
      ctrlRow.style.display = "";
      const slider = ctrlRow.querySelector("input");
      const attrs = maxCurrentState.attributes || {};
      if (attrs.min !== undefined) slider.min = attrs.min;
      if (attrs.max !== undefined) slider.max = attrs.max;
      if (attrs.step !== undefined) slider.step = attrs.step;
      slider.value = maxCurrentState.state;
      ctrlRow.querySelector(".ctrl-val").textContent = `${maxCurrentState.state} A`;
    } else {
      ctrlRow.style.display = "none";
    }

    // LED intensity slider
    const ledState = this._state("ledIntensity");
    const ledRow = r.querySelector("#ctrl-led");
    if (ledState) {
      ledRow.style.display = "";
      const ledSlider = ledRow.querySelector("input");
      const ledAttrs = ledState.attributes || {};
      if (ledAttrs.min !== undefined) ledSlider.min = ledAttrs.min;
      if (ledAttrs.max !== undefined) ledSlider.max = ledAttrs.max;
      if (ledAttrs.step !== undefined) ledSlider.step = ledAttrs.step;
      ledSlider.value = ledState.state;
      ledRow.querySelector(".ctrl-val").textContent = `${ledState.state}%`;
    } else {
      ledRow.style.display = "none";
    }
  }

  _setMetric(root, id, val) {
    const el = root.querySelector(`#${id} .metric-val`);
    if (!el) return;
    if (val && val !== "unknown" && val !== "unavailable") {
      const num = parseFloat(val);
      el.textContent = isNaN(num) ? val : (num % 1 === 0 ? num.toString() : num.toFixed(1));
    } else {
      el.textContent = "\u2014";
    }
  }

  /** Set a key metric, dividing raw value by divisor and rounding to decimals */
  _setKeyMetric(root, id, val, divisor, decimals) {
    const el = root.querySelector(`#${id} .key-metric-val`);
    if (!el) return;
    if (val && val !== "unknown" && val !== "unavailable") {
      const num = parseFloat(val) / divisor;
      el.textContent = isNaN(num) ? val : num.toFixed(decimals);
    } else {
      el.textContent = "\u2014";
    }
  }

  _deviceName() {
    const s = this._state("connectorStatus");
    if (s && s.attributes && s.attributes.friendly_name) {
      return s.attributes.friendly_name.replace(/\s*Connector.*$/i, "").trim() || "Njord GO";
    }
    if (this._hass.devices && this._config.device_id) {
      const dev = this._hass.devices[this._config.device_id];
      if (dev) return dev.name_by_user || dev.name || "Njord GO";
    }
    return "";
  }

  // ── actions ────────────────────────────────────────────────────────────

  _toggleCharge() {
    const eid = this._entities.connectorSwitch;
    if (!eid || !this._hass) return;
    this._hass.callService("switch", "toggle", { entity_id: eid });
  }

  _setMaxCurrent(value) {
    const eid = this._entities.maxCurrent;
    if (!eid || !this._hass) return;
    this._hass.callService("number", "set_value", { entity_id: eid, value });
  }

  _setLedIntensity(value) {
    const eid = this._entities.ledIntensity;
    if (!eid || !this._hass) return;
    this._hass.callService("number", "set_value", { entity_id: eid, value });
  }

  // ── styles ─────────────────────────────────────────────────────────────

  _styles() {
    return `
      :host {
        --ctek-radius: 12px;
      }
      ha-card {
        overflow: hidden;
      }
      .card-header {
        padding: 16px 16px 0;
      }
      .header-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }
      .header-left {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      .title {
        font-size: 1.15em;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .header-right {
        display: flex;
        gap: 6px;
        flex-shrink: 0;
      }
      .badge {
        font-size: 0.72em;
        padding: 2px 8px;
        border-radius: 10px;
        font-weight: 500;
        white-space: nowrap;
      }
      .badge--ok {
        background: rgba(68,181,86,0.15);
        color: var(--success-color, #44b556);
      }
      .badge--off {
        background: rgba(219,68,55,0.15);
        color: var(--error-color, #db4437);
      }
      .badge--info {
        background: rgba(33,150,243,0.15);
        color: var(--info-color, #2196f3);
      }
      .badge--muted {
        background: rgba(128,128,128,0.12);
        color: var(--secondary-text-color);
      }
      .card-content {
        padding: 12px 16px 16px;
      }

      /* ── device row: SVG + info side by side ── */
      .device-row {
        display: flex;
        gap: 16px;
        align-items: center;
      }
      .device-illustration {
        flex-shrink: 0;
        width: 80px;
      }
      .njord-svg {
        width: 100%;
        height: auto;
        filter: drop-shadow(0 2px 6px rgba(0,0,0,0.12));
      }
      .device-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      /* ── status row ── */
      .status-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .status-section {
        display: flex;
        flex-direction: column;
      }
      .status-label {
        font-size: 1.3em;
        font-weight: 700;
        line-height: 1.2;
      }
      .status-sub {
        font-size: 0.82em;
        color: var(--secondary-text-color);
      }

      /* ── toggle ── */
      .charge-toggle {
        flex-shrink: 0;
      }
      .toggle-btn {
        cursor: pointer;
        --mdc-icon-size: 28px;
        padding: 6px;
        border-radius: 50%;
        transition: background 0.2s;
      }
      .toggle-btn:hover {
        background: rgba(128,128,128,0.15);
      }

      /* ── key metrics (power + energy, always visible) ── */
      .key-metrics {
        display: flex;
        gap: 16px;
      }
      .key-metric {
        display: flex;
        align-items: baseline;
        gap: 3px;
        flex-wrap: wrap;
      }
      .key-metric-val {
        font-size: 1.6em;
        font-weight: 700;
        line-height: 1;
      }
      .key-metric-unit {
        font-size: 0.8em;
        color: var(--secondary-text-color);
        font-weight: 500;
      }
      .key-metric-label {
        width: 100%;
        font-size: 0.72em;
        color: var(--secondary-text-color);
      }

      /* ── secondary metrics (voltage + current, during charging) ── */
      .secondary-metrics {
        display: flex;
        gap: 12px;
      }
      .metric {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 0.85em;
      }
      .metric ha-icon {
        --mdc-icon-size: 16px;
        color: var(--secondary-text-color);
      }
      .metric-val {
        font-weight: 600;
      }
      .metric-unit {
        font-size: 0.8em;
        color: var(--secondary-text-color);
      }

      /* ── controls ── */
      .controls {
        margin-top: 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .control-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 12px;
        border-radius: var(--ctek-radius);
        background: var(--primary-background-color, var(--ha-card-background));
        border: 1px solid var(--divider-color);
      }
      .ctrl-label {
        font-size: 0.85em;
        color: var(--secondary-text-color);
        white-space: nowrap;
        min-width: 9em;
      }
      .ctrl-slider {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .ctrl-slider input[type="range"] {
        flex: 1;
        accent-color: var(--primary-color);
      }
      .ctrl-val {
        font-size: 0.9em;
        font-weight: 500;
        min-width: 3.5em;
        text-align: right;
      }

      /* ── LED animations ── */
      @keyframes led-pulse-kf {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 1; }
      }
      @keyframes led-blink-kf {
        0%, 49% { opacity: 1; }
        50%, 100% { opacity: 0.15; }
      }
      @keyframes led-blink-fast-kf {
        0%, 30% { opacity: 1; }
        31%, 100% { opacity: 0.1; }
      }
      .led-pulse .led-glow {
        animation: led-pulse-kf 2s ease-in-out infinite;
      }
      .led-blink .led-glow {
        animation: led-blink-kf 1.5s step-end infinite;
      }
      .led-blink-fast .led-glow {
        animation: led-blink-fast-kf 0.6s step-end infinite;
      }
    `;
  }
}

customElements.define("ctek-njord-go-card", CTEKNjordGoCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "ctek-njord-go-card",
  name: "CTEK Njord GO",
  description: "Dashboard card for the CTEK Njord GO EV charger",
  preview: true,
  documentationURL: "https://github.com/milkboy/ha-ctek-card",
});
