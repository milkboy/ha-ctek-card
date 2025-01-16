class CTEKNjordGoCard extends HTMLElement {

    config;
    content;

    // required
    setConfig(config) {
        this.config = config;
    }

    set hass(hass) {
        const entityId = this.config.entity;
        const state = hass.states[entityId];
        const stateStr = state ? state.state : 'unavailable';

        // done once
        if (!this.content) {
            // user makes sense here as every login gets it's own instance
            this.innerHTML = `
                <ha-card header="Hello ${hass.user.name}!">
                    <div class="card-content"></div>
                </ha-card>
            `;
            this.content = this.querySelector('div');
        }
        // done repeatedly
        this.content.innerHTML = `
            <p>The ${entityId} is ${stateStr}.</p>
        `;
    }

  // The height of your card. Home Assistant uses this to automatically
  // distribute all cards over the available columns in masonry view
  getCardSize() {
    return 3;
  }
}

customElements.define('ctek-njord-go-card', CTEKNjordGoCard);