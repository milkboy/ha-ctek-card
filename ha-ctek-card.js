const CARD_VERSION = "0.2.0";

console.info(
  `%c CTEK-NJORD-GO-CARD %c v${CARD_VERSION} `,
  "color: white; background: #1a73e8; font-weight: bold; padding: 2px 4px;",
  "color: #1a73e8; background: white; font-weight: bold; padding: 2px 4px;",
);

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Given one CTEK entity id, derive the common prefix so we can find siblings.
 * e.g.  "sensor.ctek_abc123_connector_status_1" → "ctek_abc123"
 */
function ctekPrefix(entityId) {
  // entity ids look like  <domain>.ctek_<id>_<description>
  const name = entityId.split(".").pop(); // "ctek_abc123_connector_status_1"
  // The prefix is everything up to and including the device-id segment.
  // Device descriptions are defined keys, so we match "ctek_<alphanum>"
  const m = name.match(/^(ctek_[^_]+)/);
  return m ? m[1] : name;
}

function findEntity(hass, prefix, pattern) {
  return Object.keys(hass.states).find(
    (eid) => eid.includes(prefix) && pattern.test(eid),
  );
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

    // Only rebuild DOM on first render; subsequent calls just update values
    if (!this._rendered) {
      this.innerHTML = `
        <div style="padding: 16px;">
          <p><b>CTEK Njord GO Card</b></p>
          <p style="margin-bottom:12px;color:var(--secondary-text-color);font-size:0.9em;">
            Pick any CTEK entity – all related entities for the same device will be discovered automatically.
          </p>
          <ha-entity-picker
            allow-custom-entity
          ></ha-entity-picker>
          <label for="title" style="display:block;margin-top:12px;margin-bottom:4px;font-weight:500;">Title (optional)</label>
          <input id="title" type="text"
            style="width:100%;padding:8px;border-radius:4px;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color);box-sizing:border-box;"
            placeholder="Njord GO" />
        </div>
      `;

      const picker = this.querySelector("ha-entity-picker");
      picker.addEventListener("value-changed", (ev) => {
        this._config = { ...this._config, entity: ev.detail.value };
        this._dispatch();
      });
      this.querySelector("#title").addEventListener("input", (ev) => {
        this._config = { ...this._config, title: ev.target.value };
        this._dispatch();
      });
      this._rendered = true;
    }

    // Update values on every render (hass or config change)
    const picker = this.querySelector("ha-entity-picker");
    picker.hass = this._hass;
    picker.value = this._config.entity || "";
    picker.label = "Entity (any CTEK entity)";
    this.querySelector("#title").value = this._config.title || "";
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
  Available:     { icon: "mdi:power-plug-off",          color: "var(--state-icon-color)",         label: "Available" },
  Charging:      { icon: "mdi:battery-charging-medium",  color: "var(--state-active-color, #44b556)", label: "Charging" },
  SuspendedEVSE: { icon: "mdi:timer-pause",              color: "var(--warning-color, #ff9800)",   label: "Suspended (EVSE)" },
  SuspendedEV:   { icon: "mdi:battery",                  color: "var(--warning-color, #ff9800)",   label: "Suspended (EV)" },
  Preparing:     { icon: "mdi:battery-alert",             color: "var(--info-color, #2196f3)",     label: "Preparing" },
  Finishing:     { icon: "mdi:check-circle",              color: "var(--success-color, #44b556)",  label: "Finishing" },
  Faulted:       { icon: "mdi:alert-circle",              color: "var(--error-color, #db4437)",    label: "Faulted" },
  Offline:       { icon: "mdi:power-plug-off-outline",    color: "var(--disabled-text-color)",     label: "Offline" },
  Unavailable:   { icon: "mdi:help-circle-outline",       color: "var(--disabled-text-color)",     label: "Unavailable" },
};

class CTEKNjordGoCard extends HTMLElement {
  _config = {};
  _hass;
  _prefix;
  _entities = {};
  _root;

  // ── HA lifecycle ────────────────────────────────────────────────────────

  static getConfigElement() {
    return document.createElement("ctek-njord-go-card-editor");
  }

  static getStubConfig(hass) {
    const entity = Object.keys(hass.states).find(
      (eid) => eid.includes("ctek_") && /connector_status/.test(eid),
    );
    return { entity: entity || "", title: "" };
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error("Please select a CTEK entity in the card configuration.");
    }
    this._config = config;
    this._prefix = ctekPrefix(config.entity);
    this._buildCard();
  }

  set hass(hass) {
    this._hass = hass;
    this._discoverEntities();
    this._update();
  }

  getCardSize() {
    return 4;
  }

  // ── entity discovery ───────────────────────────────────────────────────

  _discoverEntities() {
    const h = this._hass;
    const p = this._prefix;
    if (!h || !p) return;

    const f = (pat) => findEntity(h, p, pat);

    this._entities = {
      connectorStatus:  f(/sensor\..*connector_status/),
      connectorSwitch:  f(/switch\..*connector_charging/),
      online:           f(/binary_sensor\..*online/),
      cable:            f(/binary_sensor\..*cable_connected/),
      firmware:         f(/binary_sensor\..*firmware/),
      energy:           f(/sensor\..*wh_consumed/),
      voltage:          f(/sensor\..*voltage/),
      current:          f(/sensor\..*current/),
      power:            f(/sensor\..*power/),
      maxCurrent:       f(/number\..*max_current/),
      ledIntensity:     f(/number\..*led_intensity/),
      transactionId:    f(/sensor\..*transaction_id/),
      startDate:        f(/sensor\..*connector_start_date/),
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
              <ha-icon class="header-icon" icon="mdi:ev-station"></ha-icon>
              <span class="title"></span>
            </div>
            <div class="header-right">
              <span class="badge online-badge"></span>
              <span class="badge cable-badge"></span>
            </div>
          </div>
        </div>
        <div class="card-content">
          <div class="status-section">
            <ha-icon class="status-icon"></ha-icon>
            <div class="status-text">
              <span class="status-label"></span>
              <span class="status-sub"></span>
            </div>
            <div class="charge-toggle">
              <ha-icon class="toggle-btn" icon="mdi:power"></ha-icon>
            </div>
          </div>
          <div class="metrics">
            <div class="metric" id="m-power">
              <ha-icon icon="mdi:flash"></ha-icon>
              <div><span class="metric-val">—</span><span class="metric-unit">W</span></div>
              <span class="metric-label">Power</span>
            </div>
            <div class="metric" id="m-current">
              <ha-icon icon="mdi:current-ac"></ha-icon>
              <div><span class="metric-val">—</span><span class="metric-unit">A</span></div>
              <span class="metric-label">Current</span>
            </div>
            <div class="metric" id="m-voltage">
              <ha-icon icon="mdi:sine-wave"></ha-icon>
              <div><span class="metric-val">—</span><span class="metric-unit">V</span></div>
              <span class="metric-label">Voltage</span>
            </div>
            <div class="metric" id="m-energy">
              <ha-icon icon="mdi:battery-charging-100"></ha-icon>
              <div><span class="metric-val">—</span><span class="metric-unit">Wh</span></div>
              <span class="metric-label">Energy</span>
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
          </div>
        </div>
      </ha-card>
    `;

    // wire up toggle button
    this._root.querySelector(".toggle-btn").addEventListener("click", () => this._toggleCharge());

    // wire up slider
    const slider = this._root.querySelector("#ctrl-max-current input");
    slider.addEventListener("change", (e) => this._setMaxCurrent(Number(e.target.value)));
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
    const meta = STATUS_META[statusVal] || STATUS_META.Unavailable || { icon: "mdi:help-circle", color: "var(--disabled-text-color)", label: statusVal };
    const statusIcon = r.querySelector(".status-icon");
    statusIcon.setAttribute("icon", meta.icon);
    statusIcon.style.color = meta.color;
    r.querySelector(".status-label").textContent = meta.label || statusVal;

    // Status subtitle (start date or energy during charging)
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

    // Toggle button visibility & state
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

    // Metrics
    const isCharging = statusVal === "Charging" || statusVal === "SuspendedEV" || statusVal === "SuspendedEVSE" || statusVal === "Preparing" || statusVal === "Finishing";
    const metricsEl = r.querySelector(".metrics");
    metricsEl.style.display = isCharging ? "" : "none";

    if (isCharging) {
      this._setMetric(r, "m-power", this._val("power"));
      this._setMetric(r, "m-current", this._val("current"));
      this._setMetric(r, "m-voltage", this._val("voltage"));
      this._setMetric(r, "m-energy", this._val("energy"));
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
  }

  _setMetric(root, id, val) {
    const el = root.querySelector(`#${id} .metric-val`);
    if (!el) return;
    if (val && val !== "unknown" && val !== "unavailable") {
      const num = parseFloat(val);
      el.textContent = isNaN(num) ? val : (num % 1 === 0 ? num.toString() : num.toFixed(1));
    } else {
      el.textContent = "—";
    }
  }

  _deviceName() {
    // try to get friendly name from the connector status sensor
    const s = this._state("connectorStatus");
    if (s && s.attributes && s.attributes.friendly_name) {
      // strip the description suffix to get device name
      return s.attributes.friendly_name.replace(/\s*Connector.*$/i, "").trim() || "Njord GO";
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
      .header-icon {
        color: var(--primary-color);
        --mdc-icon-size: 24px;
        flex-shrink: 0;
      }
      .title {
        font-size: 1.1em;
        font-weight: 500;
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
        padding: 16px;
      }

      /* ── status row ── */
      .status-section {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        border-radius: var(--ctek-radius);
        background: var(--card-background-color, var(--ha-card-background));
        border: 1px solid var(--divider-color);
      }
      .status-icon {
        --mdc-icon-size: 36px;
        flex-shrink: 0;
      }
      .status-text {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .status-label {
        font-size: 1.15em;
        font-weight: 600;
      }
      .status-sub {
        font-size: 0.82em;
        color: var(--secondary-text-color);
      }
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

      /* ── metrics grid ── */
      .metrics {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
        margin-top: 14px;
      }
      .metric {
        text-align: center;
        padding: 10px 4px;
        border-radius: var(--ctek-radius);
        background: var(--card-background-color, var(--ha-card-background));
        border: 1px solid var(--divider-color);
      }
      .metric ha-icon {
        --mdc-icon-size: 20px;
        color: var(--secondary-text-color);
        margin-bottom: 4px;
      }
      .metric-val {
        font-size: 1.2em;
        font-weight: 600;
      }
      .metric-unit {
        font-size: 0.8em;
        color: var(--secondary-text-color);
        margin-left: 2px;
      }
      .metric-label {
        display: block;
        font-size: 0.72em;
        color: var(--secondary-text-color);
        margin-top: 2px;
      }

      /* ── controls ── */
      .controls {
        margin-top: 14px;
      }
      .control-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 12px;
        border-radius: var(--ctek-radius);
        background: var(--card-background-color, var(--ha-card-background));
        border: 1px solid var(--divider-color);
      }
      .ctrl-label {
        font-size: 0.85em;
        color: var(--secondary-text-color);
        white-space: nowrap;
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
