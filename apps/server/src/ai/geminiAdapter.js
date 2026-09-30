import { AIAssistantProvider } from './interface.js';
import { validateDraftItemSchema, validateExplanationSchema } from './schema.js';

export class GeminiAssistantAdapter extends AIAssistantProvider {
  /**
   * @param {string} apiKey - Gemini API Key from server environment variable
   */
  constructor(apiKey = process.env.GEMINI_API_KEY || '') {
    super();
    this.apiKey = apiKey;
  }

  /**
   * Turns natural language text into a structured draft item.
   * @param {string} text
   * @returns {Promise<object>}
   */
  async parseText(text) {
    if (!text || !text.trim()) {
      throw new Error('Input text is empty');
    }

    if (this.apiKey) {
      try {
        const prompt = `
You are a budget assistant. Convert the following user description of an expense into a single JSON budget item.
Amounts and prices must be in integer minor units (1 major currency unit = 100 minor units, e.g. 300 becomes 30000).
Rules:
- Type must be one of: 'one-time' or 'recurring'.
- Return ONLY valid JSON conforming to this schema without markdown or code fences:
{
  "name": "string",
  "type": "one-time" | "recurring",
  "priority": 0,
  "amount": number (in minor units),
  "day": number (1-31, for one-time),
  "dayOfMonth": number (1-31, for recurring)
}

Description to parse: "${text}"
`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json'
            }
          })
        });

        if (response.ok) {
          const result = await response.json();
          const candidateText = result.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidateText) {
            const parsed = JSON.parse(candidateText);
            return validateDraftItemSchema(parsed);
          }
        }
      } catch (err) {
        console.warn('Gemini API call failed, falling back to heuristic parser:', err.message);
      }
    }

    // Heuristic deterministic fallback when API key is not configured or network unavailable
    return this.fallbackParse(text);
  }

  /**
   * Analyzes deterministic engine output JSON and provides suggestions.
   * @param {object} timelineSummary
   * @param {number} safetyFloor
   * @returns {Promise<object>}
   */
  async explainTimeline(timelineSummary, safetyFloor) {
    if (this.apiKey) {
      try {
        // Send ONLY sanitized names and amounts, no credentials or private user info
        const sanitizedEvents = (timelineSummary.events || []).map((e) => ({
          date: e.date,
          label: e.label,
          amount: e.amount,
          balanceAfter: e.balanceAfter
        }));

        const prompt = `
You are a budget assistant. Analyze the following budget timeline summary and explain any safety floor breaches.
Safety floor: ${safetyFloor} minor units.
Floor breached: ${timelineSummary.floorBreached}.
Lowest balance: ${timelineSummary.lowestBalance} on ${timelineSummary.lowestDate}.
Ending balance: ${timelineSummary.endingBalance}.
Events: ${JSON.stringify(sanitizedEvents)}

Provide concise advice in sentence case. If breached, suggest moving an expense or adjusting income.
Return ONLY valid JSON:
{
  "summary": "Short 1-2 sentence overview",
  "suggestions": ["suggestion 1", "suggestion 2"]
}
`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: 'application/json'
            }
          })
        });

        if (response.ok) {
          const result = await response.json();
          const candidateText = result.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidateText) {
            const parsed = JSON.parse(candidateText);
            return validateExplanationSchema(parsed);
          }
        }
      } catch (err) {
        console.warn('Gemini explain call failed, falling back to heuristic:', err.message);
      }
    }

    return this.fallbackExplain(timelineSummary, safetyFloor);
  }

  /**
   * Deterministic fallback text parser.
   * Recognizes patterns like "3 outings, 50 km each, 300 per ticket" or "groceries 250 on day 15".
   */
  fallbackParse(text) {
    const lower = text.toLowerCase();

    // Check for one-time or recurring amount and day
    const amountMatch = lower.match(/(?:\$|usd|inr|₹)?\s*(\d+(?:\.\d+)?)/);
    const dayMatch = lower.match(/(?:day|on)\s*(\d{1,2})/);
    const isRecurring = lower.includes('recurring') || lower.includes('monthly') || lower.includes('bill');

    const amount = amountMatch ? Math.round(parseFloat(amountMatch[1]) * 100) : 10000;
    const day = dayMatch ? parseInt(dayMatch[1], 10) : 1;

    if (isRecurring) {
      return validateDraftItemSchema({
        name: text.slice(0, 30).trim(),
        type: 'recurring',
        priority: 0,
        amount,
        dayOfMonth: Math.min(31, Math.max(1, day))
      });
    }

    return validateDraftItemSchema({
      name: text.slice(0, 30).trim(),
      type: 'one-time',
      priority: 0,
      amount,
      day: Math.min(31, Math.max(1, day))
    });
  }

  /**
   * Deterministic fallback explanation generator.
   */
  fallbackExplain(summary, safetyFloor) {
    if (!summary.floorBreached) {
      return validateExplanationSchema({
        summary: 'Your projected balance stays safely above your safety floor throughout the month.',
        suggestions: [
          'No immediate changes needed.',
          `You have a buffer of ${(summary.lowestBalance - safetyFloor) / 100} units above your floor.`
        ]
      });
    }

    const deficit = (safetyFloor - summary.lowestBalance) / 100;
    return validateExplanationSchema({
      summary: `Your safety floor is breached on ${summary.lowestDate} with a deficit of ${deficit.toFixed(2)}.`,
      suggestions: [
        'Consider rescheduling large discretionary expenses until after your primary income date.',
        'Reducing non-essential outings or formula trips this month can restore your safety margin.'
      ]
    });
  }
}
