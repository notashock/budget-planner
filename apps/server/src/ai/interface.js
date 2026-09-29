/**
 * Provider-agnostic AI Assistant Interface.
 */
export class AIAssistantProvider {
  /**
   * Parses natural text into a structured draft item.
   * @param {string} text
   * @returns {Promise<object>}
   */
  async parseText(text) {
    throw new Error('parseText not implemented');
  }

  /**
   * Explains deterministic simulation results and suggests breach fixes.
   * @param {object} timelineSummary
   * @param {number} safetyFloor
   * @returns {Promise<object>}
   */
  async explainTimeline(timelineSummary, safetyFloor) {
    throw new Error('explainTimeline not implemented');
  }
}
