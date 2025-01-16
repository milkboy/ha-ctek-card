class CTEKNjordGoCard extends HTMLElement {
  // private properties

  _config;
  _hass;
  _elements = {};
  _isAttached = false;

  constructor() {
    super();
    console.log("CTEKNjordGoCard.constructor()");
    this.doStyle();
    this.doCard();
  }

  setConfig(config) {
    console.log("CTEKNjordGoCard.setConfig()");
    this._config = config;
    if (!this._isAttached) {
      this.doAttach();
      this.doQueryElements();
      this.doListen();
      this._isAttached = true;
    }
    this.doCheckConfig();
    this.doUpdateConfig();
  }

  set hass(hass) {
    console.log("CTEKNjordGoCard.hass()");
    this._hass = hass;
    this.doUpdateHass();
  }

  connectedCallback() {
    console.log("CTEKNjordGoCard.connectedCallback()");
  }

  onClicked() {
    console.log("CTEKNjordGoCard.onClicked()");
    this.doToggle();
  }

  // accessors
  isOff() {
    return this.getState().state == "off";
  }

  isOn() {
    return this.getState().state == "on";
  }

  getHeader() {
    return this._config.header;
  }

  getEntityID() {
    return this._config.entity;
  }

  getState() {
    return this._hass.states[this.getEntityID()];
  }

  getAttributes() {
    return this.getState().attributes;
  }

  getName() {
    const friendlyName = this.getAttributes().friendly_name;
    return friendlyName ? friendlyName : this.getEntityID();
  }

  // jobs
  doCheckConfig() {
    if (!this._config.entity) {
      throw new Error("Please define an entity!");
    }
  }

  doStyle() {
    this._elements.style = document.createElement("style");
    this._elements.style.textContent = `
            .ctek-error {
                text-color: red;
            }
            .ctek-error--hidden {
                display: none;
            }
            .ctek-dl {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }
            .ctek-dl--hidden {
                display: none;
            }
            .ctek-dt {
                display: flex;
                align-content: center;
                flex-wrap: wrap;
            }
            .ctek-dd {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, auto) minmax(0, 2fr));
                margin: 0;
            }
            .ctek-toggle {
                padding: 0.6em;
                border: grey;
                border-radius: 50%;
            }
            .ctek-toggle--on {
                background-color: green;
            }
            .ctek-toggle--off{
                background-color: red;
            }
            .ctek-button {
                display: block;
                border: outset 0.2em;
                border-radius: 50%;
                border-color: silver;
                background-color: silver;
                width: 1.4em;
                height: 1.4em;
            }
            .ctek-toggle--on .ctek-button {
            }
            .ctek-toggle--off .ctek-button {
            }
            .ctek-value {
                padding-left: 0.5em;
                display: flex;
                align-content: center;
                flex-wrap: wrap;
            }
        `;
  }

  doCard() {
    this._elements.card = document.createElement("ha-card");
    this._elements.card.innerHTML = `
                <div class="card-content">
                    <p class="ctek-error ctek-error--hidden">
                    <dl class="ctek-dl">
                        <dt class="ctek-dt"></dt>
                        <dd class="ctek-dd">
                            <span class="ctek-toggle">
                                <span class="ctek-button"></span>
                            </span>
                            <span class="ctek-value">
                            </span>
                        </dd>
                    </dl>
                </div>
        `;
  }

  doAttach() {
    this.append(this._elements.style, this._elements.card);
  }

  doQueryElements() {
    const card = this._elements.card;
    this._elements.error = card.querySelector(".ctek-error");
    this._elements.dl = card.querySelector(".ctek-dl");
    this._elements.topic = card.querySelector(".ctek-dt");
    this._elements.toggle = card.querySelector(".ctek-toggle");
    this._elements.value = card.querySelector(".ctek-value");
  }

  doUpdateConfig() {
    if (this.getHeader()) {
      this._elements.card.setAttribute("header", this.getHeader());
    } else {
      this._elements.card.removeAttribute("header");
    }
  }

  doListen() {
    this._elements.dl.addEventListener(
      "click",
      this.onClicked.bind(this),
      false,
    );
  }

  doUpdateHass() {
    if (!this.getState()) {
      this._elements.error.textContent = `${this.getEntityID()} is unavailable.`;
      this._elements.error.classList.remove("ctek-error--hidden");
      this._elements.dl.classList.add("ctek-dl--hidden");
    } else {
      this._elements.error.textContent = "";
      this._elements.topic.textContent = this.getName();
      // FIXME: charger states
      if (this.isOff()) {
        this._elements.toggle.classList.remove("ctek-toggle--on");
        this._elements.toggle.classList.add("ctek-toggle--off");
      } else if (this.isOn()) {
        this._elements.toggle.classList.remove("ctek-toggle--off");
        this._elements.toggle.classList.add("ctek-toggle--on");
      }
      this._elements.value.textContent = this.getState().state;
      this._elements.error.classList.add("ctek-error--hidden");
      this._elements.dl.classList.remove("ctek-dl--hidden");
    }
  }

  doToggle() {
    this._hass.callService("input_boolean", "toggle", {
      entity_id: this.getEntityID(),
    });
  }
}

customElements.define("ctek-njord-go-card", CTEKNjordGoCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "ctek-njord-go-card",
  name: "CTEK Njord Go",
  description: "Custom card for the Njord Go charger", // optional
});
