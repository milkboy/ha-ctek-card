class CTEKNjordGoCard extends HTMLElement {

    config;
    content;

    setConfig(config) {
        if (!config.entity) {
            throw new Error('Entity is not defined')
        }
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

window.customCards = window.customCards || [];
window.customCards.push({
    type: "ctek-njord-go-card",
    name: "CTEK Njord Go",
    description: "Custom card for the Njord Go charger" // optional
});