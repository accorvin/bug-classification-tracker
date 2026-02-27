/**
 * LLM Classifier using Claude Haiku 3.5 on Vertex AI
 * Uses direct REST API (no SDK) to avoid dependency issues.
 * Only called for bugs that rule-based classification couldn't handle.
 */

import { execSync } from 'child_process';

const GCP_PROJECT = 'itpc-gcp-ai-eng-claude';
const GCP_REGION = 'us-east5';
const MODEL = 'claude-3-5-haiku@20241022';

/**
 * Get a fresh access token via gcloud ADC
 */
function getAccessToken() {
  return execSync('gcloud auth print-access-token', { encoding: 'utf-8' }).trim();
}

/**
 * Classify a bug using Claude Haiku on Vertex AI
 * @param {Object} bug - Bug object with summary and description
 * @returns {Promise<Object>} - { classification, reason }
 */
export async function classifyWithLLM(bug) {
  const token = getAccessToken();
  const url = `https://${GCP_REGION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT}/locations/${GCP_REGION}/publishers/anthropic/models/${MODEL}:rawPredict`;

  // Truncate summary + description to 2000 chars
  const summary = bug.summary || '';
  const description = bug.description || '';
  const text = `${summary}\n\n${description}`.substring(0, 2000);

  const prompt = `You are a bug classifier for an engineering team. Classify the following bug into ONE of these categories:
- regression: bug that broke previously working functionality
- usability: UI/UX issues, confusing workflows, accessibility problems
- general-engineering: logic errors, crashes, performance issues, missing validation
- uncategorized: if you cannot confidently classify it

Bug Summary and Description:
${text}

Respond with ONLY a JSON object in this exact format:
{
  "classification": "one of: regression, usability, general-engineering, uncategorized",
  "reason": "one-line explanation of why you chose this category"
}`;

  const body = {
    anthropic_version: 'vertex-2023-10-16',
    max_tokens: 200,
    messages: [
      { role: 'user', content: prompt }
    ]
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Vertex AI API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const responseText = data.content[0].text.trim();

  // Extract JSON from the response (handle markdown code blocks if present)
  let jsonText = responseText;
  if (responseText.includes('```')) {
    const match = responseText.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
    if (match) {
      jsonText = match[1];
    }
  }

  const result = JSON.parse(jsonText);

  // Validate classification
  const validCategories = ['regression', 'usability', 'general-engineering', 'uncategorized'];
  if (!validCategories.includes(result.classification)) {
    console.warn(`Invalid classification from LLM: ${result.classification}, defaulting to uncategorized`);
    result.classification = 'uncategorized';
  }

  return {
    classification: result.classification,
    reason: result.reason || 'Classified by LLM'
  };
}
